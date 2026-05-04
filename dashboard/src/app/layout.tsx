import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paperclip Dashboard",
  description: "Agent orchestration intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="fixed inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 800px 400px at 0% 0%, rgba(192,132,252,0.04), transparent 60%), radial-gradient(ellipse 600px 300px at 100% 100%, rgba(201,164,73,0.03), transparent 60%)",
          zIndex: 0,
        }} />
        <div className="relative" style={{ zIndex: 1 }}>
          {children}
        </div>
      </body>
    </html>
  );
}
