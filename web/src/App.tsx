import { Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import MateriasList from "./pages/MateriasList";
import MateriaDetail from "./pages/MateriaDetail";

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/materias" element={<MateriasList />} />
          <Route path="/materias/:id" element={<MateriaDetail />} />
        </Routes>
      </main>
      <footer className="footer">
        <span>OverThinkers · Ideias em Rede 2026 · Instituto Kunumi</span>
        <span>Dataset: PublicHearingBR (LDS)</span>
      </footer>
    </div>
  );
}
