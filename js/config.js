/* Where client data files live. On <owner>.github.io/<repo>/ this is detected automatically. */
window.CC_CONFIG = (function () {
  var owner = 'moonyose', repo = 'client-checklist', branch = 'main';
  var m = /^([^.]+)\.github\.io$/.exec(location.hostname), seg = location.pathname.split('/').filter(Boolean)[0];
  if (m && seg) { owner = m[1]; repo = seg; }
  var q = new URLSearchParams(location.search);
  if (q.get('repo') && /^[\w.-]+\/[\w.-]+$/.test(q.get('repo'))) { owner = q.get('repo').split('/')[0]; repo = q.get('repo').split('/')[1]; }
  return { owner: owner, repo: repo, branch: q.get('branch') || branch, dataDir: 'data/clients' };
})();
