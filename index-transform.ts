import { TargetOptions } from '@angular-builders/custom-webpack';
import { trailenceAppVersionCode, trailenceAppVersionName } from 'src/app/trailence-version';

export default (targetOptions: TargetOptions, indexHtml: string) => {
  let start = indexHtml.indexOf('<link rel="stylesheet');
  let end = indexHtml.indexOf('>', start);
  let css = indexHtml.substring(start, end + 1);
  css = css.replace(/\"/g, "\\\"").replace(/[\r\n]+/g," ").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  indexHtml = indexHtml.substring(0, start) + indexHtml.substring(end + 1);

  start = indexHtml.indexOf('<!-- trailence -->');
  end = indexHtml.indexOf('</body>');
  let scripts = indexHtml.substring(start + 18, end);
  scripts = scripts.replace(/\"/g, "\\\"").replace(/[\r\n]+/g," ").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  scripts = "<script>window.trailenceAppVersionName = \"" + trailenceAppVersionName + "\"; window.trailenceAppVersionCode = " + trailenceAppVersionCode + "; window._ng_trailence = \"" + css + scripts + "\";startNg();</script>";
  return `${indexHtml.slice(0, start)}
            ${scripts}
            ${indexHtml.slice(end)}`;
};
