"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { statusLabel, statusTone } from "./lib";

/* ---------- Toasts ---------- */
type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++counter.current;
    setToasts((list) => [...list.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Small pieces ---------- */
export function Pill({ status, children }: { status: string; children?: React.ReactNode }) {
  return <span className={`pill pill-${statusTone(status)}`}><i />{children ?? statusLabel(status)}</span>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Empty({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: string; count?: number }>; onChange: (id: T) => void }) {
  return (
    <div className="chips" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={`chip ${value === o.id ? "active" : ""}`} onClick={() => onChange(o.id)}>
          {o.label}{o.count !== undefined && <b>{o.count}</b>}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="skeleton-list">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>;
}

/* ---------- Drawer (slide-over panel) ---------- */
export function Drawer({ open, title, subtitle, onClose, children, footer, wide }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={`drawer ${wide ? "drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
}

/* ---------- Confirm dialog ---------- */
type ConfirmRequest = { title: string; body: string; action: string; danger?: boolean; resolve: (ok: boolean) => void };
const ConfirmContext = createContext<(title: string, body: string, action: string, danger?: boolean) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const ask = useCallback((title: string, body: string, action: string, danger?: boolean) => new Promise<boolean>((resolve) => setRequest({ title, body, action, danger, resolve })), []);
  const close = (ok: boolean) => { request?.resolve(ok); setRequest(null); };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && (
        <div className="drawer-backdrop center" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label={request.title}>
            <h2>{request.title}</h2>
            <p>{request.body}</p>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => close(false)}>Keep it</button>
              <button className={`btn ${request.danger ? "btn-danger" : "btn-primary"}`} onClick={() => close(true)} autoFocus>{request.action}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
