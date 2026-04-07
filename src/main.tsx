import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Intercept recovery token in URL BEFORE Supabase removes it
if (window.location.hash.includes("type=recovery")) {
  sessionStorage.setItem("recovery_mode", "true");
}

createRoot(document.getElementById("root")!).render(<App />);
