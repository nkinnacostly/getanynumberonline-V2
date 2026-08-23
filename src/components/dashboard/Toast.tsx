"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

interface ToastCtx {
  toast: (message: string, type?: "success" | "error") => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      const id = ++_id;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto px-4 py-3 rounded-lg text-[13px] font-medium max-w-xs animate-[fadeIn_0.2s_ease-out]"
            style={{
              backgroundColor: t.type === "success" ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)",
              border: `1px solid ${t.type === "success" ? "var(--accent)" : "var(--danger)"}`,
              color: t.type === "success" ? "var(--accent)" : "var(--danger)",
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
