//! WebRTC screen streaming for termhost.
//! Daemon creates a PeerConnection that sends H.264 video.
//! Phone creates offer with recvonly transceiver → daemon answers with video track.

use std::sync::Arc;
use rtc::media_stream::{MediaStreamTrack};
use rtc::peer_connection::configuration::{RTCConfigurationBuilder, interceptor_registry::register_default_interceptors, media_engine::MediaEngine};
use rtc::peer_connection::sdp::RTCSessionDescription;
use rtc::peer_connection::transport::RTCIceServer;
use rtc::rtp;
use rtc::rtp_transceiver::rtp_sender::{RTCRtpCodec, RTCRtpCodingParameters, RTCRtpEncodingParameters, RtpCodecKind};
use webrtc::media_stream::track_local::static_rtp::TrackLocalStaticRTP;
use webrtc::media_stream::track_local::TrackLocal;
use webrtc::peer_connection::{PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCIceGatheringState, RTCPeerConnectionState};
use webrtc::runtime::{Runtime, default_runtime};

#[derive(Clone)]
struct DaemonHandler {
    gather_complete_tx: std::sync::Arc<tokio::sync::Notify>,
}

#[async_trait::async_trait]
impl PeerConnectionEventHandler for DaemonHandler {
    async fn on_ice_gathering_state_change(&self, state: RTCIceGatheringState) {
        if state == RTCIceGatheringState::Complete {
            self.gather_complete_tx.notify_one();
        }
    }
    async fn on_connection_state_change(&self, state: RTCPeerConnectionState) {
        tracing::info!("webrtc state: {state}");
    }
}

/// Start WebRTC: receive phone's offer SDP, return answer SDP,
/// then transmit H.264 frames from frame_rx via RTP.
pub async fn start_webrtc_stream(
    offer_sdp: &str,
    frame_rx: tokio::sync::mpsc::Receiver<Vec<u8>>,
) -> std::result::Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let runtime = default_runtime().ok_or_else(|| {
        rtc::shared::error::Error::Other("no async runtime".into())
    })?;

    let mut media_engine = MediaEngine::default();
    media_engine.register_default_codecs()?;

    let registry = register_default_interceptors(
        rtc::interceptor::Registry::new(), &mut media_engine,
    )?;

    let notify = std::sync::Arc::new(tokio::sync::Notify::new());
    let handler = Arc::new(DaemonHandler { gather_complete_tx: notify.clone() });

    let pc: Arc<dyn PeerConnection> = Arc::new(
        PeerConnectionBuilder::new()
            .with_configuration(
                RTCConfigurationBuilder::new()
                    .with_ice_servers(vec![RTCIceServer {
                        urls: vec!["stun:stun.l.google.com:19302".to_string()],
                        ..Default::default()
                    }])
                    .build(),
            )
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .with_handler(handler as Arc<dyn PeerConnectionEventHandler>)
            .with_runtime(runtime.clone())
            .with_udp_addrs(vec!["0.0.0.0:0".to_string()])
            .build()
            .await?,
    );

    let ssrc: u32 = rand::random();
    let h264_codec = RTCRtpCodec {
        mime_type: "video/H264".to_string(),
        clock_rate: 90000,
        channels: 0,
        sdp_fmtp_line: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f".to_string(),
        rtcp_feedback: vec![],
    };

    let track = Arc::new(TrackLocalStaticRTP::new(MediaStreamTrack::new(
        "screen".to_string(),
        "termhost".to_string(),
        "termhost-screen".to_string(),
        RtpCodecKind::Video,
        vec![RTCRtpEncodingParameters {
            rtp_coding_parameters: RTCRtpCodingParameters {
                ssrc: Some(ssrc),
                ..Default::default()
            },
            codec: h264_codec,
            ..Default::default()
        }],
    )));

    pc.add_track(track.clone() as Arc<dyn TrackLocal>).await?;

    let offer: RTCSessionDescription = serde_json::from_str(offer_sdp)?;
    pc.set_remote_description(offer).await?;

    let answer = pc.create_answer(None).await?;
    pc.set_local_description(answer.clone()).await?;

    notify.notified().await;

    let json_answer = serde_json::to_string(
        &pc.local_description().await.unwrap()
    )?;

    runtime.spawn(Box::pin(async move {
        let mut frame_rx = frame_rx;
        let mut seq: u16 = 0;
        while let Some(frame) = frame_rx.recv().await {
            let packet = rtp::Packet {
                header: rtp::Header {
                    sequence_number: seq,
                    timestamp: seq as u32 * 3000,
                    ssrc,
                    ..Default::default()
                },
                payload: bytes::Bytes::from(frame),
            };
            seq = seq.wrapping_add(1);
            if track.write_rtp(packet).await.is_err() { break; }
        }
    }));

    Ok(json_answer)
}
