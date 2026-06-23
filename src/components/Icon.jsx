const paths = {
  app: (
    <>
      <path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8L12 3.5Z" />
      <path d="M8.5 10.25h7" />
      <path d="M8.5 13.75h4.25" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 0 0-14.25-5" />
      <path d="M5 3v4h4" />
      <path d="M4 13a8 8 0 0 0 14.25 5" />
      <path d="M19 21v-4h-4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  send: (
    <>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </>
  ),
  stop: <path d="M7 7h10v10H7z" />
};

export default function Icon({ name }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
