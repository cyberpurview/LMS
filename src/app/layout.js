import { AuthProvider } from "./components/AuthProvider";
import "./globals.css";

export const metadata = {
  title: "CyberPurview LMS — Practice Exams & Certification Prep",
  description: "CyberPurview's learning management system for timed certification practice exams with real-time scoring and performance analytics.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
