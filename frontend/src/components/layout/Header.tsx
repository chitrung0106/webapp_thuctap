export default function Header() {
  return (
    <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Output Inspector, trang chủ">
          <span className="wordmark-mark" aria-hidden="true">OI</span>
          <span>OUTPUT INSPECTOR</span>
        </a>
        <span className="status"><span className="status-dot" /> WORKSPACE</span>
      </header>
  );
}
