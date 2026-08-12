//! Telegram authorization: Mini App initData / Login Widget verification + sessions.
//!
//! Standard Telegram auth algorithm (works for BOTH the Mini App SDK
//! `window.Telegram.WebApp.initData` and the Login Widget's auth payload):
//!
//! ```text
//! secret_key = HMAC_SHA256(key = "WebAppData", msg = bot_token)
//! hash       = HMAC_SHA256(key = secret_key, msg = data_check_string)
//! ```
//! where `data_check_string` is all `key=value` pairs from initData
//! (except `hash`), sorted alphabetically, joined with `\n`.
//!
//! Config file: `%LOCALAPPDATA%\TermHost\tg_config.json`
//! ```json
//! { "bot_token": "123:ABC...", "bot_username": "my_termhost_bot", "allowed_ids": [743241] }
//! ```
//! While `bot_token` is unset, auth stays disabled (fail-open legacy mode:
//! shared token injected into HTML). Once set, the shared token is no longer
//! injected and the web UI requires Telegram login.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

/// On-disk configuration (see module docs).
#[derive(serde::Deserialize, serde::Serialize, Clone, Default, Debug)]
pub struct TgConfigFile {
    #[serde(default)]
    pub bot_token: Option<String>,
    #[serde(default)]
    pub bot_username: Option<String>,
    /// Telegram user ids allowed to log in. Empty = nobody (fail closed).
    #[serde(default)]
    pub allowed_ids: Vec<i64>,
}

/// One issued session (maps opaque token -> Telegram user id).
struct TgSession {
    user_id: i64,
    expires: SystemTime,
}

pub struct TgUser {
    pub id: i64,
    pub username: Option<String>,
    pub first_name: String,
}

pub enum TgError {
    Disabled,
    InvalidSignature,
    Expired,
    NotAllowed,
}

pub struct TgAuth {
    pub config: TgConfigFile,
    sessions: Mutex<HashMap<String, TgSession>>,
}

const SESSION_TTL: Duration = Duration::from_secs(7 * 24 * 3600); // 7 days
/// initData must be fresh enough: not older than 7 days, not more than 1h in the future.
const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);
const MAX_FUTURE: Duration = Duration::from_secs(3600);

impl TgAuth {
    pub fn load() -> Self {
        let config = load_config();
        Self {
            config,
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// True once a bot token is configured — web UI switches to TG-gated mode.
    pub fn enabled(&self) -> bool {
        self.config.bot_token.as_ref().map(|t| !t.is_empty()).unwrap_or(false)
    }

    /// Verify an initData string (TMA `initData` or Login Widget payload
    /// reconstructed in JS as urlencoded pairs + `hash`).
    pub fn verify_init_data(&self, init_data: &str) -> Result<TgUser, TgError> {
        let token = self
            .config
            .bot_token
            .as_deref()
            .filter(|t| !t.is_empty())
            .ok_or(TgError::Disabled)?;
        verify(init_data, token).ok_or(TgError::InvalidSignature)
    }

    pub fn is_allowed(&self, user_id: i64) -> bool {
        self.config.allowed_ids.contains(&user_id)
    }

    /// Issue a session for an allowed user. Returns the opaque session token.
    pub fn issue_session(&self, user_id: i64) -> String {
        let token = random_hex(32);
        let expires = SystemTime::now() + SESSION_TTL;
        self.sessions
            .lock()
            .unwrap()
            .insert(token.clone(), TgSession { user_id, expires });
        // opportunistic cleanup of expired sessions
        self.sessions
            .lock()
            .unwrap()
            .retain(|_, s| s.expires > SystemTime::now());
        token
    }

    pub fn check_session(&self, token: &str) -> bool {
        let mut map = self.sessions.lock().unwrap();
        match map.get(token) {
            Some(s) if s.expires > SystemTime::now() => true,
            Some(_) => {
                map.remove(token);
                false
            }
            None => false,
        }
    }

    pub fn revoke_session(&self, token: &str) {
        self.sessions.lock().unwrap().remove(token);
    }
}

fn config_path() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|d| d.join("TermHost").join("tg_config.json"))
}

fn load_config() -> TgConfigFile {
    let Some(path) = config_path() else { return TgConfigFile::default() };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Write the config (used by tests / admin tooling).
pub fn save_config(cfg: &TgConfigFile) -> std::io::Result<()> {
    let Some(path) = config_path() else {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no data dir"));
    };
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(cfg)?)
}

/// The core verification. Returns the Telegram user on success.
pub fn verify(init_data: &str, bot_token: &str) -> Option<TgUser> {
    let mut pairs: Vec<(String, String)> = Vec::new();
    let mut hash: Option<String> = None;
    for pair in init_data.split('&') {
        let (k, v) = pair.split_once('=')?;
        let key = percent_decode(k);
        let val = percent_decode(v);
        if key == "hash" {
            hash = Some(val);
        } else {
            pairs.push((key, val));
        }
    }
    let hash = hash?;

    pairs.sort();
    let dcs = pairs
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("\n");

    let secret = hmac_sha256(b"WebAppData", bot_token.as_bytes());
    if hex(&hmac_sha256(&secret, dcs.as_bytes())) != hash {
        return None;
    }

    // auth_date freshness (Telegram server time when initData was issued)
    if let Some((_, ad)) = pairs.iter().find(|(k, _)| k == "auth_date") {
        if let Ok(auth_ts) = ad.parse::<u64>() {
            let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            if auth_ts > now {
                if auth_ts - now > MAX_FUTURE.as_secs() {
                    return None; // issued in the future — clock tampering
                }
            } else if now - auth_ts > MAX_AGE.as_secs() {
                return None; // stale
            }
        }
    }

    // user identity: TMA embeds a nested `user` JSON; Login Widget puts
    // `id`/`username`/`first_name` at the top level.
    let id: i64;
    let mut username: Option<String> = None;
    let mut first_name = String::new();
    if let Some((_, u)) = pairs.iter().find(|(k, _)| k == "user") {
        let v: serde_json::Value = serde_json::from_str(u).ok()?;
        id = v.get("id")?.as_i64()?;
        username = v.get("username").and_then(|x| x.as_str()).map(String::from);
        first_name = v.get("first_name").and_then(|x| x.as_str()).unwrap_or("").to_string();
    } else {
        id = pairs.iter().find(|(k, _)| k == "id")?.1.parse().ok()?;
        username = pairs.iter().find(|(k, _)| k == "username").map(|(_, v)| v.clone());
        first_name = pairs
            .iter()
            .find(|(k, _)| k == "first_name")
            .map(|(_, v)| v.clone())
            .unwrap_or_default();
    }

    Some(TgUser { id, username, first_name })
}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(msg);
    mac.finalize().into_bytes().to_vec()
}

fn hex(data: &[u8]) -> String {
    data.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Minimal percent-decoder for initData values (handles %XX and '+').
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(b);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    let _ = getrandom::getrandom(&mut buf);
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a valid initData for the given bot token (mirrors the JS side).
    fn make_init_data(bot_token: &str, user: &serde_json::Value, auth_date: u64) -> String {
        let user_json = user.to_string();
        let mut pairs = vec![
            ("auth_date".to_string(), auth_date.to_string()),
            ("query_id".to_string(), "AAFtest123".to_string()),
            ("user".to_string(), user_json),
        ];
        pairs.sort();
        let dcs = pairs
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("\n");
        let secret = hmac_sha256(b"WebAppData", bot_token.as_bytes());
        let hash = hex(&hmac_sha256(&secret, dcs.as_bytes()));
        pairs.push(("hash".to_string(), hash));
        // urlencode the user JSON minimally (spaces -> %20 not needed here)
        pairs
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("&")
    }

    #[test]
    fn verifies_valid_tma_init_data() {
        let token = "123456:TESTBOTTOKEN";
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let user = serde_json::json!({
            "id": 743241,
            "first_name": "Viach",
            "username": "viachq",
            "language_code": "uk"
        });
        let init_data = make_init_data(token, &user, now);
        let u = verify(&init_data, token).expect("valid signature must pass");
        assert_eq!(u.id, 743241);
        assert_eq!(u.username.as_deref(), Some("viachq"));
        assert_eq!(u.first_name, "Viach");
    }

    #[test]
    fn rejects_wrong_token() {
        let token = "123456:TESTBOTTOKEN";
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let user = serde_json::json!({"id": 743241, "first_name": "Viach"});
        let init_data = make_init_data(token, &user, now);
        assert!(verify(&init_data, "999999:WRONGTOKEN").is_none());
    }

    #[test]
    fn rejects_tampered_user() {
        let token = "123456:TESTBOTTOKEN";
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let user = serde_json::json!({"id": 743241, "first_name": "Viach"});
        let init_data = make_init_data(token, &user, now);
        // tamper with the user id inside initData (hash no longer matches)
        let tampered = init_data.replace("%7B%22id%22%3A743241", "%7B%22id%22%3A999");
        let tampered = tampered.replace("\"id\":743241", "\"id\":999");
        assert!(verify(&tampered, token).is_none());
    }

    #[test]
    fn rejects_stale_auth_date() {
        let token = "123456:TESTBOTTOKEN";
        let old = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() - 30 * 24 * 3600;
        let user = serde_json::json!({"id": 743241, "first_name": "Viach"});
        let init_data = make_init_data(token, &user, old);
        assert!(verify(&init_data, token).is_none());
    }

    #[test]
    fn verifies_login_widget_shape() {
        // Login Widget callback fields (top-level, no nested user JSON)
        let token = "123456:TESTBOTTOKEN";
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
        let mut pairs = vec![
            ("auth_date".to_string(), now.to_string()),
            ("first_name".to_string(), "Viach".to_string()),
            ("id".to_string(), "743241".to_string()),
            ("username".to_string(), "viachq".to_string()),
        ];
        pairs.sort();
        let dcs = pairs
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("\n");
        let secret = hmac_sha256(b"WebAppData", token.as_bytes());
        let hash = hex(&hmac_sha256(&secret, dcs.as_bytes()));
        let init_data = format!(
            "auth_date={}&first_name=Viach&id=743241&username=viachq&hash={}",
            now, hash
        );
        let u = verify(&init_data, token).expect("widget payload must pass");
        assert_eq!(u.id, 743241);
        assert_eq!(u.username.as_deref(), Some("viachq"));
    }

    #[test]
    fn sessions_issue_and_check() {
        let auth = TgAuth::load();
        let t = auth.issue_session(743241);
        assert!(auth.check_session(&t));
        assert!(!auth.check_session("bogus"));
        auth.revoke_session(&t);
        assert!(!auth.check_session(&t));
    }
}
