/**
 * Runs before the page paints: sets the saved language and direction on <html>, so Arabic does not
 * flash left-to-right first. It repeats the logic of the provider in plain JavaScript, because it
 * runs before React exists.
 */
export const LOCALE_BOOT_SCRIPT = [
  '(function(){try{',
  "var l=localStorage.getItem('aich.locale');",
  "if(l!=='fr'&&l!=='ar'&&l!=='en'){",
  "var p=navigator.languages||[navigator.language||'en'];l='en';",
  "for(var i=0;i<p.length;i++){var b=String(p[i]).toLowerCase().split('-')[0];",
  "if(b==='fr'||b==='ar'||b==='en'){l=b;break}}}",
  "document.documentElement.lang=l;document.documentElement.dir=l==='ar'?'rtl':'ltr'",
  '}catch(e){}})();',
].join('');
