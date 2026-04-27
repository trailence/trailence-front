import { registerPlugin } from '@capacitor/core';
import { LocalFilesPlugin } from 'src/app/services/local-files/local-files.interface';

const LocalFiles = registerPlugin<LocalFilesPlugin>('LocalFiles');

export default LocalFiles;
