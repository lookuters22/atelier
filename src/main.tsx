import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";
import App from "./App.tsx";

{
  const s = document.createElement("style");
  s.textContent = `[data-slot="sidebar-inset"]{animation:dash-blur-in 1.6s cubic-bezier(0.22,0.68,0.35,1.0) both}`;
  document.head.appendChild(s);
  setTimeout(() => s.remove(), 2000);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
