import { useCallback, useEffect, useState } from 'react';

export const ROUTES = ['overview', 'forecast', 'accuracy', 'explorer', 'sources'];

function currentRoute() {
  const route = window.location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(route) ? route : 'overview';
}

export function useHashRoute() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next) => {
    window.location.hash = `/${next}`;
    setRoute(next);
  }, []);

  return [route, navigate];
}
