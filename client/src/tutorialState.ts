const KEY = 'scourgeborn-tutorial-done'

export function loadTutorialDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function rememberTutorialDone() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* ignore */
  }
}
