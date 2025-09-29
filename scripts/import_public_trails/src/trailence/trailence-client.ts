import * as crypto from 'crypto';
import { TrailCollectionDto } from 'front/model/dto/trail-collection';
import { TrailDto } from 'front/app/model/dto/trail';
import { Config } from 'src/config/config';
import { TrackDto } from 'front/model/dto/track';
import { Photo } from 'front/model/photo';
import { PhotoDto } from 'front/model/dto/photo';
import { AuthResponse } from 'front/services/auth/auth-response';
import { Preferences } from 'front/services/preferences/preferences';

export class TrailenceClient {

  private url: string;
  private adminUsername: string;
  private adminPassword: string;
  private remoteUsername: string;
  private remotePassword: string;
  private remoteDisplayName?: string;

  private adminAccessToken: string | undefined;
  private remoteAccessToken: string | undefined;
  private remotePreferences: Preferences | undefined;

  constructor(
    config: Config,
    remoteName: string,
  ) {
    this.url = config.getRequiredString('trailence', 'url');
    this.adminUsername = config.getRequiredString('admin', 'username');
    this.adminPassword = config.getRequiredString('admin', 'password');
    this.remoteUsername = config.getRequiredString(remoteName, 'username');
    this.remotePassword = config.getRequiredString(remoteName, 'password');
    this.remoteDisplayName = config.getString(remoteName, 'displayName');
  }

  private async adminToken() {
    if (!this.adminAccessToken)
      this.adminAccessToken = (await this.login(this.adminUsername, this.adminPassword)).accessToken;
    return this.adminAccessToken;
  }

  private async userToken() {
    if (!this.remoteAccessToken) {
      const auth = await this.login(this.remoteUsername, this.remotePassword);
      this.remoteAccessToken = auth.accessToken;
      this.remotePreferences = auth.preferences;
    }
    return this.remoteAccessToken;
  }

  private async login(email: string, password: string) {
    console.log('Connecting to Trailence as ' + email + '...');
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
      console.error('Login error: ', await loginResponse.json(), 'request', body);
      throw Error('Cannot login to Trailence');
    }
    const authResponse: any = await loginResponse.json();
    console.log('Connected to Trailence with ' + email);
    return authResponse as AuthResponse;
  }

  public async createUserIfNeeded() {
    console.log('Check if user ' + this.remoteUsername + ' exists');
    const userSubscriptionsResponse = await fetch(this.url + '/api/admin/users/v1/' + this.remoteUsername + '/subscriptions', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.adminToken()
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
      console.log('Create user ' + this.remoteUsername);
      const createUserResponse = await fetch(this.url + '/api/admin/users/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + await this.adminToken()
        },
        body: JSON.stringify({email: this.remoteUsername, password: this.remotePassword})
      });
      if (!createUserResponse.ok) {
        console.error('Create user error: ', await createUserResponse.json());
        throw new Error();
      }
      console.log('User created.');
    }
    if (this.remoteDisplayName) {
      await this.userToken();
      if (this.remotePreferences!.alias !== this.remoteDisplayName) {
        console.log('Setting user display name');
        this.remotePreferences!.alias = this.remoteDisplayName;
        const response = await fetch(this.url + '/api/preferences/v1', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + await this.userToken()
          },
          body: JSON.stringify(this.remotePreferences!)
        });
        if (!response.ok) {
          console.error('Set preferences error: ', await response.json());
          throw new Error();
        }
        console.log('User preferences saved.');
      }
    }
  }

  private collections: TrailCollectionDto[] | undefined;

  public async refreshCollections() {
    console.log('Fetching collections');
    const response = await fetch(this.url + '/api/trail-collection/v1/_bulkGetUpdates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.userToken()
      },
      body: '[]'
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Get collections error: ', json);
      throw new Error();
    }
    this.collections = json.created;
    console.log('Collections fetched: ' + this.collections!.length);
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
    console.log('Creating collection ' + name + ' of type ' + type + ' on Trailence');
    const response = await fetch(this.url + '/api/trail-collection/v1/_bulkCreate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.userToken()
      },
      body: JSON.stringify([{
        name,
        type,
        owner: this.remoteUsername,
        uuid: crypto.randomUUID(),
        version: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }])
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Create collection error: ', json);
      throw new Error();
    }
    console.log('Collection created');
    const result = json as TrailCollectionDto[];
    if (this.collections) this.collections.push(...result);
    return result[0];
  }

  private trails: TrailDto[] | undefined;

  public async refreshTrails() {
    console.log('Fetching trails');
    const response = await fetch(this.url + '/api/trail/v1/_bulkGetUpdates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.userToken()
      },
      body: '[]'
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Get trails error: ', json);
      throw new Error();
    }
    this.trails = json.created;
    console.log('Trails fetched: ' + this.trails!.length);
  }

  public async getTrails() {
    if (this.trails === undefined) await this.refreshTrails();
    return this.trails!;
  }

  public async getTrailsByCollectionUuid(collectionUuid: string) {
    return (await this.getTrails()).filter(t => t.collectionUuid === collectionUuid);
  }

  public async createTrail(trail: TrailDto): Promise<TrailDto> {
    console.log('Creating trail on Trailence');
    const response = await fetch(this.url + '/api/trail/v1/_bulkCreate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.userToken()
      },
      body: JSON.stringify([trail])
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Create trail error: ', json);
      throw new Error();
    }
    console.log('Trail created');
    const result = json as TrailDto[];
    if (this.trails) this.trails.push(...result);
    return result[0];
  }

  private tracks?: TrackDto[];

  public async getTrack(uuid: string): Promise<TrackDto> {
    const known = this.tracks?.find(t => t.uuid === uuid);
    if (known) return known;
    const response = await fetch(this.url + '/api/track/v1/' + this.remoteUsername + '/' + uuid, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + await this.userToken()
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
    console.log('Creating track on Trailence');
    const response = await fetch(this.url + '/api/track/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + await this.userToken()
      },
      body: JSON.stringify(track)
    });
    const json: any = await response.json();
    if (!response.ok) {
      console.error('Create track error: ', json);
      throw new Error();
    }
    console.log('Track created');
    const result = json as TrackDto;
    if (this.tracks) this.tracks.push(result);
    return result;
  }

  public async createPhoto(photo: PhotoDto, blob: Blob) {
    console.log('Creating photo on Trailence');
    const headers: any = {
      'Authorization': 'Bearer ' + await this.userToken(),
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
    console.log('Photo created');
  }

}
