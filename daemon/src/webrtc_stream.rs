//! WebRTC screen streaming.
//! Uses webrtc-rs to create a PeerConnection with a H.264 video track.
//! Signaling over existing WebSocket.

use std::sync::Arc;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::*;
use webrtc::media_stream::{
    track_local::static_sample::TrackLocalStaticSample,
    MediaStreamTrack,
};

/// Handle incoming SDP offer from phone, return answer SDP and a SampleWriter.
pub async fn handle_offer(
    offer_sdp: &str,
) -> Result<(String, TrackWriter), Box<dyn std::error::Error>> {
    #[derive(Clone)]
    struct IceHandler;
    #[async_trait::async_trait]
    impl PeerConnectionEventHandler for IceHandler {
        async fn on_ice_candidate(&self, _: RTCPeerConnectionIceEvent) {}
    }

    let config = RTCConfigurationBuilder::default()
        .with_ice_servers(vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_owned()],
            ..Default::default()
        }])
        .build();

    let pc = PeerConnectionBuilder::new()
        .with_configuration(config)
        .with_handler(Arc::new(IceHandler))
        .with_udp_addrs(vec!["0.0.0.0:0".to_owned()])
        .build()
        .await?;

    // Add a video transceiver (recvonly — phone receives)
    let (_, h264_codec) = rtc::rtp_transceiver::rtp_sender::rtp_codec::new_h264_codec(
        rtc::rtp_transceiver::RtpCodecKind::Video,
    )?;
    let track = MediaStreamTrack::new(
        "screen".into(),
        "termhost".into(),
        Some(h264_codec),
        None,
        vec![],
    )?;

    let local = TrackLocalStaticSample::new(track)?;
    let ssrc = local.ssrcs().first().copied().unwrap_or(1);
    let writer = local.sample_writer(ssrc);

    pc.add_track(local).await?;

    // Set remote SDP (phone's offer)
    let offer = RTCSessionDescription::offer(offer_sdp.to_owned());
    pc.set_remote_description(offer).await?;

    // Create answer
    let answer = pc.create_answer(None).await?;
    pc.set_local_description(answer.clone()).await?;

    Ok((answer.sdp, TrackWriter { inner: writer }))
}

/// Wraps SampleWriter for easier use.
pub struct TrackWriter {
    inner: rtc::media_stream::track_local::static_sample::SampleWriter<'static>,
}

impl TrackWriter {
    pub async fn write(&self, data: bytes::Bytes, duration_ms: u64, is_key: bool) {
        let sample = rtc::media::Sample {
            data,
            samples: 1,
            duration: std::time::Duration::from_millis(duration_ms),
            packetizer_flags: if is_key { rtc::media::sample::PacketizerFlag::KeySample } else { rtc::media::sample::PacketizerFlag::None },
            prev_dropped_packets: 0,
        };
        let _ = self.inner.write(&sample, &[]).await;
    }
}
