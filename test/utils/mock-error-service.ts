import { ErrorService } from 'src/app/services/progress/error.service';

export function provideErrorService(logToConsole: boolean = false) {
  return {
    provide: ErrorService,
    useValue: {
      addNetworkError: (error: any, i18nText: string, args: any[]) => {
        if (logToConsole)
          console.error('Network error', error, i18nText, args);
      },
      addTechnicalError: (error: any, i18nText: string, args: any[]) => {
        if (logToConsole)
          console.error('Technical error', error, i18nText, args);
      },
      addError: (error: any) => {
        if (logToConsole)
          console.error('Error', error);
      },
      addErrors: (errors: any[]) => {
        if (logToConsole)
          console.error('Errors', errors);
      }
    }
  }
}
