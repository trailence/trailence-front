import { registerPlugin } from '@capacitor/core';

export interface TrailencePlugin {

  saveFile(call: {filename: string, type: string, data: string}): Promise<{saved: boolean}>;

}

const Trailence = registerPlugin<TrailencePlugin>('Trailence');

export default Trailence;