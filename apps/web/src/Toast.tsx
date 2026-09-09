import { useEffect, useState } from 'react';
import { Icon as IslandIcon } from 'animal-island-ui';
import { Check } from 'lucide-react';

export function Toast({ message }: { message: string }) {
  const [lastMessage, setLastMessage] = useState(message);
  useEffect(() => {
    if (message) setLastMessage(message);
  }, [message]);
  return (
    <>
      <span className="motion-announcement" role="status">
        {message}
      </span>
      <div className="toast" data-visible={!!message} aria-hidden="true">
        <IslandIcon icon={Check} size={17} />
        {message || lastMessage}
      </div>
    </>
  );
}
