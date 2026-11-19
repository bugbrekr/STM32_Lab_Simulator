import React, { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { openFile, openInMx, build, runTarget, deleteProject, activateProject } from '../app/controller';
import type { Project } from '../project/project';
import { Icon } from './icons';

interface Node {
  name: string;
  path: string;
  children: Map<string, Node>;
  file: boolean;
}

function buildTree(p: Project): Node {
  const root: Node = { name: p.name, path: '', children: new Map(), file: false };
  const paths = Object.keys(p.files).sort((a, b) => {
    const da = a.includes('/') ? 0 : 1;
    const db = b.includes('/') ? 0 : 1;
    return da - db || a.localeCompare(b);
  });
  for (const path of paths) {
    const parts = path.split('/');
    let cur = root;
    parts.forEach((part, i) => {
      const sub = parts.slice(0, i + 1).join('/');
      let n = cur.children.get(part);
      if (!n) {
        n = { name: part, path: sub, children: new Map(), file: i === parts.length - 1 };
        cur.children.set(part, n);
      }
      cur = n;
    });
  }
  return root;
}

function fileIcon(name: string) {
  if (name.endsWith('.c')) return <Icon name="cfile" />;
  if (name.endsWith('.h')) return <Icon name="hfile" />;
  if (name.endsWith('.ioc')) return <Icon name="ioc" />;
  if (name.endsWith('.s')) return <Icon name="sfile" />;
  if (name.endsWith('.launch')) return <Icon name="debug" />;
  return <Icon name="file" />;
}

export function ProjectExplorer({ onProperties }: { onProperties: (id: string) => void }) {
  const projects = useStore((s) => s.projects);
  const activeId = useStore((s) => s.activeProjectId);
  const activeFile = useStore((s) => s.activeFile);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const trees = useMemo(() => projects.map((p) => ({ p, t: buildTree(p) })), [projects]);
  const isOpen = (k: string, def = false) => open[k] ?? def;
  const toggle = (k: string, def = false) => setOpen((o) => ({ ...o, [k]: !(o[k] ?? def) }));

  const renderNode = (p: Project, n: Node, depth: number): React.JSX.Element[] => {
    const out: React.JSX.Element[] = [];
    const kids = [...n.children.values()].sort((a, b) => (a.file === b.file ? 0 : a.file ? 1 : -1));
    for (const c of kids) {
      const key = `${p.id}:${c.path}`;
      const def = ['Core', 'Core/Src', 'Core/Inc'].includes(c.path);
      if (c.file) {
        const sel = activeFile?.projectId === p.id && activeFile.path === c.path;
        out.push(
          <div
            key={key}
            className={`tree-row ${sel ? 'sel' : ''}`}
            style={{ paddingLeft: depth * 14 + 18 }}
            onClick={() => activateProject(p.id)}
            onDoubleClick={() => (c.name.endsWith('.ioc') ? openInMx(p.id) : openFile({ projectId: p.id, path: c.path }))}
            title={c.path}
          >
            {fileIcon(c.name)} <span>{c.name}</span>
          </div>,
        );
      } else {
        const o = isOpen(key, def);
        out.push(
          <div key={key} className="tree-row" style={{ paddingLeft: depth * 14 + 4 }} onClick={() => toggle(key, def)}>
            <span className="twisty">{o ? '▾' : '▸'}</span>
            <Icon name={c.path === 'Drivers' || c.path === 'Core' ? 'srcfolder' : 'folder'} /> <span>{c.name}</span>
          </div>,
        );
        if (o) out.push(...renderNode(p, c, depth + 1));
      }
    }
    return out;
  };

  return (
    <div className="explorer" onClick={() => setMenu(null)}>
      {trees.length === 0 && (
        <div className="empty-hint">
          No projects in the workspace.
          <br />
          Use <b>File ▸ New ▸ STM32 Project</b> (opens CubeMX) or <b>File ▸ Open Lab Experiment</b>.
        </div>
      )}
      {trees.map(({ p, t }) => {
        const k = `${p.id}:`;
        const o = isOpen(k, p.id === activeId);
        const isActive = p.id === activeId;
        return (
          <div key={p.id}>
            <div
              className={`tree-row project ${isActive ? 'sel' : ''}`}
              onClick={() => {
                activateProject(p.id);
                toggle(k, p.id === activeId);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                activateProject(p.id);
                setMenu({ x: e.clientX, y: e.clientY, id: p.id });
              }}
            >
              <span className="twisty">{o ? '▾' : '▸'}</span>
              <Icon name="project" /> <b>{p.name}</b>
            </div>
            {o && (
              <>
                <div className="tree-row" style={{ paddingLeft: 18 }}>
                  <span className="twisty">▸</span>
                  <Icon name="includes" /> Includes
                </div>
                {renderNode(p, t, 1)}
              </>
            )}
          </div>
        );
      })}
      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <div onClick={() => (build(menu.id), setMenu(null))}>
            <Icon name="build" /> Build Project
          </div>
          <div onClick={() => (runTarget(false, menu.id), setMenu(null))}>
            <Icon name="run" /> Run As ▸ STM32 C/C++ Application
          </div>
          <div onClick={() => (runTarget(true, menu.id), setMenu(null))}>
            <Icon name="debug" /> Debug As ▸ STM32 C/C++ Application
          </div>
          <hr />
          <div onClick={() => (openInMx(menu.id), setMenu(null))}>
            <Icon name="ioc" /> Open .ioc in STM32CubeMX
          </div>
          <div onClick={() => (onProperties(menu.id), setMenu(null))}>Properties</div>
          <hr />
          <div
            onClick={() => {
              const p = projects.find((x) => x.id === menu.id);
              if (p && confirm(`Delete project '${p.name}' from the workspace?`)) deleteProject(menu.id);
              setMenu(null);
            }}
          >
            ✖ Delete
          </div>
        </div>
      )}
    </div>
  );
}
