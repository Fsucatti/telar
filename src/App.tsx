import { useEffect } from "react";
import { useStore } from "./state/store";
import { Builder } from "./ui/Builder";
import { Home } from "./ui/Home";

export function App() {
  const currentId = useStore((state) => state.currentId);
  const toast = useStore((state) => state.toast);
  const dismissToast = useStore((state) => state.dismissToast);

  // Opening a share link adds a copy of that agent, then clears the link from the address bar.
  useEffect(() => {
    if (location.hash.startsWith("#share=")) {
      useStore.getState().importFromHash(location.hash);
      history.replaceState(null, "", location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismissToast, 3500);
    return () => clearTimeout(timer);
  }, [toast, dismissToast]);

  return (
    <>
      {currentId ? <Builder key={currentId} /> : <Home />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
