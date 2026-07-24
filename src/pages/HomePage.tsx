import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { Landing } from "../components/Landing";
import { Footer } from "../components/Footer";

export function HomePage() {
  const navigate = useNavigate();
  const topRef = useRef<HTMLDivElement>(null);

  // Supports arriving at /#features (e.g. clicked from the tool page) by
  // scrolling to the right section once this page has actually mounted.
  useEffect(() => {
    if (window.location.hash) {
      const id = window.location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  function scrollToTop() {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleNavigate(id: string) {
    if (id === "top") {
      scrollToTop();
      return;
    }
    if (id === "tool") {
      navigate("/app");
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-4 gap-6">
      <div ref={topRef} />
      <Navbar onNavigate={handleNavigate} variant="home" />
      <Landing onTryDemo={() => navigate("/app")} />
      <Footer onBackToTop={scrollToTop} />
    </div>
  );
}
