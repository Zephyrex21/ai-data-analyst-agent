import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { ToolPage } from "./pages/ToolPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/app" element={<ToolPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
