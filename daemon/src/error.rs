use thiserror::Error;

#[derive(Error, Debug)]
pub enum DaemonError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Warp error: {0}")]
    Warp(#[from] warp::Error),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Auth error: {0}")]
    Auth(String),
    #[error("{0}")]
    Msg(String),
}

pub type Result<T> = std::result::Result<T, DaemonError>;
