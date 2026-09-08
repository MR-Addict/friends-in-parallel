import { people } from './lib';

/** Decorative only: the real friend filters and their accessible names live in Timeline. */
export function IslandScene({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`island-scene ${compact ? 'compact' : ''}`} aria-hidden="true">
      <span className="island-sun" />
      <span className="island-cloud cloud-one" />
      <span className="island-cloud cloud-two" />
      <span className="island-hill hill-back" />
      <span className="island-hill hill-front" />
      <div className="island-friends">
        {people.map((person, index) => (
          <span className={`island-friend friend-${index}`} key={person.id}>
            <img src={`/stickers/fluent/${person.avatar}.png`} alt="" />
          </span>
        ))}
      </div>
      <span className="island-caption">在一起，就是好天气</span>
    </div>
  );
}
