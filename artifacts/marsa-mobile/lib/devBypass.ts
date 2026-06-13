let _active = false;

export const devBypass = {
  get active() { return _active; },
  enable() { _active = true; },
  disable() { _active = false; },
};
