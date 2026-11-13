import { useCallback, useRef, useState } from 'react';

/**
 * A value with undo and redo. `commit` is one undo step. A drag changes the value many times: call `begin`,
 * then `live` for each movement, then `end`, and the whole drag is one step.
 */
export function useHistory<T>(initial: T, limit = 100) {
  const [value, setValue] = useState<T>(initial);
  const current = useRef<T>(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const snapshot = useRef<T | null>(null);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);

  const set = (v: T) => {
    current.current = v;
    setValue(v);
  };

  const commit = useCallback(
    (next: T) => {
      if (next === current.current) return;
      past.current.push(current.current);
      if (past.current.length > limit) past.current.shift();
      future.current = [];
      set(next);
      refresh();
    },
    [limit],
  );

  const begin = useCallback(() => {
    snapshot.current = current.current;
  }, []);

  const live = useCallback((next: T) => set(next), []);

  const end = useCallback(() => {
    const before = snapshot.current;
    snapshot.current = null;
    if (before !== null && before !== current.current) {
      past.current.push(before);
      if (past.current.length > limit) past.current.shift();
      future.current = [];
      refresh();
    }
  }, [limit]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(current.current);
    set(prev);
    refresh();
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(current.current);
    set(next);
    refresh();
  }, []);

  /** Replaces the value and forgets the history (a new design). */
  const reset = useCallback((v: T) => {
    past.current = [];
    future.current = [];
    snapshot.current = null;
    set(v);
    refresh();
  }, []);

  return {
    value,
    ref: current,
    commit,
    begin,
    live,
    end,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
