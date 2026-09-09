export const styles = `
:root { color-scheme: light; --ink:#17201c; --muted:#66736c; --paper:#f7f5ef; --card:#fffefa; --line:#dcded6; --accent:#2f6f55; --accent-soft:#e0efe8; --danger:#9c3f35; --shadow:0 10px 30px rgba(30,45,37,.07); }
* { box-sizing:border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
a { color:inherit; }
.shell { width:min(1080px,calc(100% - 32px)); margin:0 auto; }
.topbar { border-bottom:1px solid var(--line); background:rgba(247,245,239,.92); position:sticky; top:0; z-index:5; backdrop-filter:blur(12px); }
.topbar .shell { height:64px; display:flex; align-items:center; justify-content:space-between; }
.brand { font:700 19px/1.2 ui-serif,Georgia,serif; text-decoration:none; letter-spacing:-.02em; }
nav { display:flex; gap:8px; }
nav a { color:var(--muted); text-decoration:none; padding:7px 11px; border-radius:9px; }
nav a:hover,nav a.active { color:var(--ink); background:#ebe9e2; }
main { padding:44px 0 80px; }
.hero { display:flex; gap:24px; align-items:end; justify-content:space-between; margin-bottom:30px; }
h1,h2,h3 { font-family:ui-serif,Georgia,serif; letter-spacing:-.025em; line-height:1.15; }
h1 { font-size:clamp(34px,6vw,56px); margin:0 0 9px; }
h2 { font-size:27px; margin:0 0 14px; }
h3 { margin:0 0 8px; font-size:20px; }
.lede,.muted { color:var(--muted); }
.lede { margin:0; max-width:660px; font-size:18px; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:16px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; box-shadow:var(--shadow); }
.video-card { display:grid; grid-template-columns:120px 1fr; gap:16px; }
.video-card img { width:120px; aspect-ratio:16/9; object-fit:cover; border-radius:10px; background:#e6e5df; }
.card-title { font:700 20px/1.2 ui-serif,Georgia,serif; text-decoration:none; }
.meta { display:flex; flex-wrap:wrap; gap:7px 12px; color:var(--muted); font-size:13px; margin-top:10px; }
.pill { display:inline-flex; border-radius:999px; padding:3px 9px; font-size:12px; font-weight:700; background:#ecece7; color:var(--muted); }
.pill.ready { background:var(--accent-soft); color:var(--accent); }
.pill.failed,.pill.skipped { background:#f5e6e2; color:var(--danger); }
.empty { text-align:center; padding:60px 20px; border:1px dashed #c8cbc2; border-radius:18px; color:var(--muted); }
.stack { display:grid; gap:16px; }
form.stack { max-width:720px; }
label { display:grid; gap:6px; font-weight:650; }
.hint { color:var(--muted); font-weight:400; font-size:13px; }
input,textarea,select { width:100%; border:1px solid #c7cbc2; background:white; color:var(--ink); padding:11px 12px; border-radius:10px; font:inherit; }
textarea { min-height:96px; resize:vertical; }
input:focus,textarea:focus,select:focus { outline:3px solid rgba(47,111,85,.15); border-color:var(--accent); }
.row { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.actions { display:flex; flex-wrap:wrap; align-items:center; gap:10px; }
button,.button { border:0; border-radius:10px; padding:10px 15px; background:var(--accent); color:white; font:700 14px/1.2 inherit; cursor:pointer; text-decoration:none; display:inline-flex; }
button.secondary,.button.secondary { color:var(--ink); background:#e9e8e1; }
button.danger { background:var(--danger); }
.channel-head { display:flex; justify-content:space-between; gap:16px; align-items:start; }
.rules { margin:12px 0 0; color:var(--muted); font-size:14px; }
.notice { background:var(--accent-soft); color:#245640; padding:12px 15px; border-radius:11px; margin-bottom:20px; }
.error { background:#f5e6e2; color:#7f3029; }
.article { width:min(760px,100%); margin:0 auto; }
.article-header { border-bottom:1px solid var(--line); padding-bottom:28px; margin-bottom:28px; }
.article-header h1 { font-size:clamp(38px,7vw,62px); }
.article-body { font:19px/1.75 ui-serif,Georgia,serif; }
.article-body h2 { margin-top:1.8em; }
.article-body h3 { margin-top:1.6em; }
.article-body a { color:var(--accent); }
.article-body blockquote { margin-left:0; padding-left:18px; border-left:3px solid var(--accent); color:var(--muted); }
.learning-list { padding-left:20px; }
.learning-list li { margin:.55em 0; }
.detail-panel { margin:30px 0; }
code { background:#ecebe5; padding:2px 5px; border-radius:5px; }
@media(max-width:640px) { main{padding-top:28px}.hero{display:block}.hero .button{margin-top:18px}.video-card{grid-template-columns:1fr}.video-card img{width:100%}.row{grid-template-columns:1fr}.topbar .shell{height:58px}.shell{width:min(100% - 22px,1080px)} }
`;
