const Trailence = {

  canKeepOnScreenLock: (call: {}) => Promise.resolve({allowed: false}),
  setKeepOnScreenLock: (call: {enabled: boolean}) => Promise.resolve({success: false}),
  getKeepOnScreenLock: (call: {}) => Promise.resolve({enabled: false}),

  getInsets: (call: {}) => Promise.resolve({top: 0, bottom: 0, left: 0, right: 0}),

  share: (call: {link: string, title?: string}) => Promise.resolve(),

};
export default Trailence;
