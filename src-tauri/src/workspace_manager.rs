use crate::ws_server::{TerminalInfo, WorkspaceInfo, WorkspaceOps};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, serde::Deserialize)]
pub struct WorkspaceData {
    pub name: String,
    pub color: u8,
    pub terminal_ids: Vec<String>,
}

pub struct WorkspaceManager {
    workspaces: Vec<WorkspaceData>,
    active_idx: usize,
    terminal_infos: Arc<Mutex<Vec<TerminalInfo>>>,
}

impl WorkspaceManager {
    pub fn new(terminal_infos: Arc<Mutex<Vec<TerminalInfo>>>) -> Self {
        Self {
            workspaces: Vec::new(),
            active_idx: 0,
            terminal_infos,
        }
    }

    pub fn sync(&mut self, workspaces: Vec<WorkspaceData>, active_idx: usize) {
        self.workspaces = workspaces;
        self.active_idx = active_idx.min(self.workspaces.len().saturating_sub(1));
    }

    fn terminals_for_workspace(&self, idx: usize) -> Vec<TerminalInfo> {
        let ws = match self.workspaces.get(idx) {
            Some(w) => w,
            None => return Vec::new(),
        };

        let all_infos = match self.terminal_infos.lock() {
            Ok(infos) => infos.clone(),
            Err(e) => e.into_inner().clone(),
        };

        let id_set: HashMap<&str, ()> = ws.terminal_ids.iter().map(|id| (id.as_str(), ())).collect();
        all_infos.into_iter().filter(|t| id_set.contains_key(t.id.as_str())).collect()
    }
}

impl WorkspaceOps for WorkspaceManager {
    fn list(&self) -> (Vec<WorkspaceInfo>, usize) {
        let list = self.workspaces.iter().map(|w| WorkspaceInfo {
            name: w.name.clone(),
            color: w.color,
            terminal_count: w.terminal_ids.len(),
        }).collect();
        (list, self.active_idx)
    }

    fn switch(&mut self, idx: usize) -> Vec<TerminalInfo> {
        if idx < self.workspaces.len() {
            self.active_idx = idx;
        }
        self.terminals_for_workspace(self.active_idx)
    }

    fn create(&mut self, name: String, color: u8) {
        self.workspaces.push(WorkspaceData {
            name,
            color,
            terminal_ids: Vec::new(),
        });
        self.active_idx = self.workspaces.len() - 1;
    }

    fn delete(&mut self, idx: usize) {
        if self.workspaces.len() <= 1 {
            return;
        }
        if idx < self.workspaces.len() {
            self.workspaces.remove(idx);
            if self.active_idx >= self.workspaces.len() {
                self.active_idx = self.workspaces.len() - 1;
            }
        }
    }
}
