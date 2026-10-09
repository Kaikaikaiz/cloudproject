import { useState } from 'react';
export function useCursorPage(scope) {
  const [state, setState] = useState({ scope, stack: [null], next: null });
  const current = state.scope === scope ? state : { scope, stack: [null], next: null };
  return {
    cursor: current.stack.at(-1),
    nextCursor: current.next,
    hasPrevious: current.stack.length > 1,
    setNext: (value) =>
      setState((old) => ({
        ...old,
        scope,
        stack: old.scope === scope ? old.stack : [null],
        next: value || null,
      })),
    next: () =>
      setState({ ...current, stack: [...current.stack, current.next], next: null }),
    previous: () =>
      setState({ ...current, stack: current.stack.slice(0, -1), next: null }),
    reset: () => setState({ scope, stack: [null], next: null }),
  };
}
