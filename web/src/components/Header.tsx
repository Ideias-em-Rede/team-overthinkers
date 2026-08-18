import { NavLink, Link } from "react-router-dom";
import "./Header.css";

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__brand">
          <span className="site-header__logo">OT</span>
          <div className="site-header__title">
            <strong>OverThinkers</strong>
            <span>Ideias em Rede 2026 · Instituto Kunumi</span>
          </div>
        </Link>
        <nav className="site-header__nav">
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/materias">Matérias</NavLink>
          <NavLink to="/panorama">Panorama</NavLink>
        </nav>
      </div>
    </header>
  );
}
