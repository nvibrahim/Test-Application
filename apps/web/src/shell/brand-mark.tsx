/* eslint-disable @next/next/no-img-element */
/** The logo when one is uploaded (light and dark variants), otherwise the name as text. */
export function BrandMark({
  assets,
  name,
  onDark = false,
  className = 'h-7',
}: {
  assets: Record<string, string>;
  name: string;
  onDark?: boolean;
  className?: string;
}) {
  const light = assets['logo_light'];
  const dark = assets['logo_dark'] ?? light;
  if (!light && !dark) return <span>{name}</span>;
  if (onDark) return <img src={dark ?? light} alt={name} className={className} />;
  return (
    <>
      {light ? <img src={light} alt={name} className={`${className} dark:hidden`} /> : null}
      <img
        src={dark ?? light}
        alt={name}
        className={`${className} ${light ? 'hidden dark:block' : ''}`}
      />
    </>
  );
}
