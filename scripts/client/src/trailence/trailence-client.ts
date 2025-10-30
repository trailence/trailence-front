import * as crypto from 'crypto';
import { TrailCollectionDto } from 'front/model/dto/trail-collection';
import { TrailDto } from 'front/app/model/dto/trail';
import { Config } from 'src/config/config';
import { TrackDto } from 'front/model/dto/track';
import { Photo } from 'front/model/photo';
import { PhotoDto } from 'front/model/dto/photo';
import { AuthResponse } from 'front/services/auth/auth-response';
import { Preferences } from 'front/services/preferences/preferences';
import { PublicTrack, PublicTrail } from 'front/services/fetch-source/trailence.plugin';

export class TrailenceClient {

  private url: string;
  public readonly username: string;
  public readonly password: string;

  private accessToken: string | undefined;
  private preferences: Preferences | undefined;

  constructor(
    config: Config,
    userConfigName: string,
  ) {
    this.url = config.getRequiredString('trailence', 'url');
    this.username = config.getRequiredString(userConfigName, 'username');
    this.password = config.getRequiredString(userConfigName, 'password');
  }

  private async getAccessToken() {
    if (!this.accessToken) {
      const auth = (await this.login(this.username, this.password));
      this.accessToken = auth.accessToken;
      this.preferences = auth.preferences;
    }
    return this.accessToken;
  }

  private async login(email: string, password: string) {
    process.stdout.write('Connecting to Trailence as ' + email + '...');
    const keypair = await crypto.webcrypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      false,
      ['sign', 'verify']
    );

    const publicKeyBase64 = await crypto.webcrypto.subtle.exportKey('spki', keypair.publicKey)
      .then(pk => btoa(String.fromCharCode(...new Uint8Array(pk))));

    const body = JSON.stringify({
      email,
      password,
      publicKey: publicKeyBase64,
      expiresAfter: 60 * 60 * 1000,
    });
    const loginResponse = await fetch(this.url + '/api/auth/v1/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    if (!loginResponse.ok) {
      console.log('');
      console.error('Login error: ', await loginResponse.json(), 'request', body);
      throw Error('Cannot login to Trailence');
    }
    const authResponse: any = await loginResponse.json();
    console.log('Connected.');
    return authResponse as AuthResponse;
  }

  public async createUserIfNeeded(username: string, password: string) {
    console.log('Check if user ' + username + ' exists');
    const userSubscriptionsResponse = await fetch(this.url + '/api/admin/users/v1/' + username + '/subscriptions', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      }
    });
    const subscriptions = await userSubscriptionsResponse.json();
    if (!userSubscriptionsResponse.ok) {
      console.error('Error: ', subscriptions);
      throw new Error();
      return;
    }
    if (Array.isArray(subscriptions) && subscriptions.length > 0) {
      console.log('User exists.');
    } else {
      console.log('Create user ' + username);
      const createUserResponse = await fetch(this.url + '/api/admin/users/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + await this.getAccessToken()
        },
        body: JSON.stringify({email: username, password})
      });
      if (!createUserResponse.ok) {
        console.error('Create user error: ', await createUserResponse.json());
        throw new Error();
      }
      console.log('User created.');
    }
  }

  public async setDisplayName(displayName: string) {
    const token = await this.getAccessToken();
    if (this.preferences!.alias !== displayName) {
      console.log('Setting user display name');
      this.preferences!.alias = displayName;
      const response = await fetch(this.url + '/api/preferences/v1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(this.preferences!)
      });
      if (!response.ok) {
        console.error('Set preferences error: ', await response.json());
        throw new Error();
      }
      console.log('User preferences saved.');
    }
  }

  private collections: TrailCollectionDto[] | undefined;

  public async refreshCollections() {
    process.stdout.write('Fetching collections... ');
    const response = await fetch(this.url + '/api/trail-collection/v1/_bulkGetUpdates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: '[]'
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.log('');
      console.error('Get collections error: ', json);
      throw new Error();
    }
    this.collections = json.created;
    console.log('' + this.collections!.length + ' found');
  }

  public async getCollections(): Promise<TrailCollectionDto[]> {
    if (this.collections === undefined) await this.refreshCollections();
    return this.collections!;
  }

  public async getMyTrails(): Promise<TrailCollectionDto> {
    return (await this.getCollections()).find(c => c.type === 'MY_TRAILS')!;
  }

  public async getOrCreatePubDraft(): Promise<TrailCollectionDto> {
    const pubDraft = (await this.getCollections()).find(c => c.type === 'PUB_DRAFT');
    if (pubDraft) return pubDraft;
    return await this.createCollection('', 'PUB_DRAFT');
  }

  public async getOrCreatePubSubmit(): Promise<TrailCollectionDto> {
    const pubDraft = (await this.getCollections()).find(c => c.type === 'PUB_SUBMIT');
    if (pubDraft) return pubDraft;
    return await this.createCollection('', 'PUB_SUBMIT');
  }

  public async createCollection(name: string, type: string): Promise<TrailCollectionDto> {
    process.stdout.write('Creating collection ' + name + ' of type ' + type + ' on Trailence... ');
    const response = await fetch(this.url + '/api/trail-collection/v1/_bulkCreate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: JSON.stringify([{
        name,
        type,
        owner: this.username,
        uuid: crypto.randomUUID(),
        version: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }])
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.log('');
      console.error('Create collection error: ', json);
      throw new Error();
    }
    console.log('created.');
    const result = json as TrailCollectionDto[];
    if (this.collections) this.collections.push(...result);
    return result[0];
  }

  private trails: TrailDto[] | undefined;

  public async refreshTrails() {
    process.stdout.write('Fetching trails... ');
    const response = await fetch(this.url + '/api/trail/v1/_bulkGetUpdates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: '[]'
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.log('');
      console.error('Get trails error: ', json);
      throw new Error();
    }
    this.trails = json.created;
    console.log('' + this.trails!.length + ' found.');
  }

  public async getTrails() {
    if (this.trails === undefined) await this.refreshTrails();
    return this.trails!;
  }

  public async getTrailsByCollectionUuid(collectionUuid: string) {
    return (await this.getTrails()).filter(t => t.collectionUuid === collectionUuid);
  }

  public async createTrail(trail: TrailDto): Promise<TrailDto> {
    const response = await fetch(this.url + '/api/trail/v1/_bulkCreate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: JSON.stringify([trail])
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Create trail error: ', json);
      throw new Error();
    }
    const result = json as TrailDto[];
    if (this.trails) this.trails.push(...result);
    return result[0];
  }

  private tracks?: TrackDto[];

  public async getTrack(uuid: string): Promise<TrackDto> {
    const known = this.tracks?.find(t => t.uuid === uuid);
    if (known) return known;
    const response = await fetch(this.url + '/api/track/v1/' + this.username + '/' + uuid, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + await this.getAccessToken()
      }
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Get track error: ', json);
      throw new Error();
    }
    const result = json as TrackDto;
    if (this.tracks) this.tracks.push(result);
    return result;
  }

  public async createTrack(track: TrackDto): Promise<TrackDto> {
    const response = await fetch(this.url + '/api/track/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: JSON.stringify(track)
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Create track error: ', json);
      throw new Error();
    }
    const result = json as TrackDto;
    if (this.tracks) this.tracks.push(result);
    return result;
  }

  public async createPhoto(photo: PhotoDto, blob: Blob) {
    const headers: any = {
      'Authorization': 'Bearer ' + await this.getAccessToken(),
      'Content-Type': 'application/octet-stream',
      'X-Description': encodeURIComponent(photo.description),
      'X-Cover': photo.isCover ? 'true' : 'false',
      'X-Index': photo.index,
    };
    if (photo.dateTaken) headers['X-DateTaken'] = photo.dateTaken;
    if (photo.latitude) headers['X-Latitude'] = photo.latitude;
    if (photo.longitude) headers['X-Longitude'] = photo.longitude;
    const response = await fetch(this.url + '/api/photo/v1/' + photo.trailUuid + '/' + photo.uuid, {
      method: 'POST',
      headers,
      body: blob
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Create photo error: ', json);
      throw new Error();
    }
  }

  public async countPublicTrailByTile(zoom: number, tiles: number[]) {
    const response = await fetch(this.url + '/api/public/trails/v1/countByTile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: JSON.stringify({
        zoom,
        tiles,
      })
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('countPublicTrailByTile error: ', json);
      throw new Error();
    }
    return json as {trailsByTile: {tile: number, nbTrails: number}[]};
  }

  public async countTotalPublicTrails() {
    const counts = await this.countPublicTrailByTile(1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    return counts.trailsByTile.reduce((p, n) => p + n.nbTrails, 0);
  }

  public async getAllPublicTrailsIds(offset: number, limit: number) {
    const response = await fetch(this.url + '/api/public/trails/v1/trail?offset=' + offset + '&limit=' + limit, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + await this.getAccessToken()
      }
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Get all public trails ids error: ', json);
      throw new Error();
    }
    return json as string[];
  }

  public async getPublicTrails(uuids: string[]) {
    const response = await fetch(this.url + '/api/public/trails/v1/trailsByIds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: JSON.stringify(uuids)
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Get public trails error: ', json);
      throw new Error();
    }
    return json as PublicTrail[];
  }

  public async getPublicTrack(trailUuid: string) {
    const response = await fetch(this.url + '/api/public/trails/v1/track/' + trailUuid, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + await this.getAccessToken()
      }
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Get public trail track error: ', json);
      throw new Error();
    }
    return json as PublicTrack;
  }

  public async patchPublicTrail(trailUuid: string, patch: PublicTrailPatch) {
    const response = await fetch(this.url + '/api/public/trails/v1/trail/' + trailUuid, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.getAccessToken()
      },
      body: JSON.stringify(patch),
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Patch public trail error: ', json);
      throw new Error();
    }
    return json as PublicTrail;
  }

}

export interface PublicTrailPatch {
  loopType?: string;
}
