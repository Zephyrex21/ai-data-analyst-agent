import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { ToolPage } from "./pages/ToolPage";
import { SplashScreen } from "./components/SplashScreen";

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <BrowserRouter>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/app" element={<ToolPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
