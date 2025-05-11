const Trailence = {

  canKeepOnScreenLock: (call: {}) => Promise.resolve({allowed: false}),
  setKeepOnScreenLock: (call: {enabled: boolean}) => Promise.resolve({success: false}),
  getKeepOnScreenLock: (call: {}) => Promise.resolve({enabled: false}),

};
export default Trailence;
