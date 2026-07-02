use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const OUTPUT_BUFFER_MAX: usize = 8 * 1024 * 1024;

pub struct BufferManager {
    buffers: HashMap<String, Arc<Mutex<Vec<u8>>>>,
}

impl BufferManager {
    pub fn new() -> Self {
        Self {
            buffers: HashMap::new(),
        }
    }

    pub fn create(&mut self, id: &str) -> Arc<Mutex<Vec<u8>>> {
        let buf = Arc::new(Mutex::new(Vec::with_capacity(32768)));
        self.buffers.insert(id.to_string(), buf.clone());
        buf
    }

    pub fn append(buf: &Arc<Mutex<Vec<u8>>>, data: &[u8]) {
        if let Ok(mut b) = buf.lock() {
            b.extend_from_slice(data);
            if b.len() > OUTPUT_BUFFER_MAX {
                let start = b.len() - OUTPUT_BUFFER_MAX;
                *b = b[start..].to_vec();
            }
        }
    }

    pub fn append_by_id(&self, id: &str, data: &[u8]) {
        if let Some(buf) = self.buffers.get(id) {
            Self::append(buf, data);
        }
    }

    pub fn get_data(&self, id: &str) -> Option<String> {
        self.buffers.get(id).and_then(|buf| {
            buf.lock().ok().map(|b| String::from_utf8_lossy(&b).into_owned())
        })
    }

    pub fn remove(&mut self, id: &str) {
        self.buffers.remove(id);
    }

    pub fn has(&self, id: &str) -> bool {
        self.buffers.contains_key(id)
    }
}
