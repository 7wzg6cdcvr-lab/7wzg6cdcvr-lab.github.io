/* ══════════════════════════════════════════════════════════════
   DM — painel de Tickets
   Lista (separada em Aberto/Resolvidos), abre, responde, muda
   estado e categoria — tudo a partir do site. O pedido passa
   sempre pelo Code.gs (autenticado com o PIN da app) — o token do
   GitHub nunca chega ao browser.
   ══════════════════════════════════════════════════════════════ */
const Tickets = (() => {
  let screen = 'list';      // 'list' | 'detail' | 'new'
  let cache = [];

  const fmtDate = iso => new Date(iso).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' });
  const esc = s => (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Transforma "![nome](url)" e "[📎 nome](url)" em imagens/links a sério,
  // escapando tudo o resto normalmente (só usamos markdown para anexos).
  function renderRich(raw){
    const tokens = [];
    let text = (raw || '').replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => {
      tokens.push(`<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(alt)}" style="max-width:100%;border-radius:10px;margin-top:8px;display:block"></a>`);
      return `\u0000${tokens.length-1}\u0000`;
    });
    text = text.replace(/\[📎 (.*?)\]\((.*?)\)/g, (m, name, url) => {
      tokens.push(`<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:8px 12px;background:#181D26;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#F4D27A;font-size:12.5px;text-decoration:none">📎 ${esc(name)}</a>`);
      return `\u0000${tokens.length-1}\u0000`;
    });
    let out = esc(text);
    out = out.replace(/\u0000(\d+)\u0000/g, (m, i) => tokens[i]);
    return out;
  }

  const STATUSES = ['Pendente', 'Em Progresso', 'Resolvido'];
  const STATUS_COLOR = { 'Pendente':'#F0A93A', 'Em Progresso':'#5B8DEF', 'Resolvido':'#34D399' };
  const CATEGORIES = ['Casa', 'Família', 'Saúde', 'Website'];

  let pendingFile = null; // { filename, mimeType, dataBase64 } — anexo escolhido antes de enviar

  function shellHTML(){
    return `
    <div id="dm-ticket" style="position:fixed;inset:0;background:#0A0D12;z-index:9998;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif">
      <div style="display:flex;align-items:center;gap:10px;padding:calc(14px + env(safe-area-inset-top)) 16px 14px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <button id="dm-t-back" style="background:none;border:none;color:#8B95A5;font-size:20px;cursor:pointer;display:none;padding:0 4px 0 0">‹</button>
        <div id="dm-t-title" style="flex:1;font-size:16px;font-weight:600;color:#F2F4F7">Tickets</div>
        <button id="dm-t-new" style="background:#212938;border:1px solid rgba(255,255,255,0.08);color:#F4D27A;font-size:13px;font-weight:600;padding:7px 12px;border-radius:9px;cursor:pointer;font-family:inherit">+ Novo</button>
        <button id="dm-t-close" style="background:none;border:none;color:#8B95A5;font-size:24px;cursor:pointer;line-height:1;padding:0 0 0 6px">×</button>
      </div>
      <div id="dm-t-body" style="flex:1;overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch"></div>
    </div>`;
  }

  function open(){
    if (document.getElementById('dm-ticket')) return;
    document.body.insertAdjacentHTML('beforeend', shellHTML());
    document.getElementById('dm-t-close').onclick = close;
    document.getElementById('dm-t-new').onclick = () => renderNew();
    document.getElementById('dm-t-back').onclick = () => renderList();
    renderList();
  }
  function close(){ const el = document.getElementById('dm-ticket'); if (el) el.remove(); }

  function setChrome({ title, back, showNew }){
    document.getElementById('dm-t-title').textContent = title;
    document.getElementById('dm-t-back').style.display = back ? 'block' : 'none';
    document.getElementById('dm-t-new').style.display = showNew ? 'block' : 'none';
  }

  async function api(action, params, method){
    const pin = Auth.getStoredPin() || '';
    const url = Auth.API_URL + '?' + new URLSearchParams(Object.assign({ action, pin }, params||{})).toString();
    const r = await fetch(url, { method: method || 'GET' });
    return r.json();
  }

  // Anexos vão no corpo do pedido (podem ser maiores do que um URL aguenta).
  async function apiUpload(number, filename, mimeType, dataBase64){
    const pin = Auth.getStoredPin() || '';
    const url = Auth.API_URL + '?action=uploadAttachment';
    const r = await fetch(url, { method:'POST', body: JSON.stringify({ pin, number, filename, mimeType, dataBase64 }) });
    return r.json();
  }

  function readFileAsBase64(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function rowHTML(t){
    return `
      <div class="dm-t-row" data-n="${t.number}" style="display:flex;align-items:center;gap:10px;padding:13px 4px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer">
        <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${STATUS_COLOR[t.status]||'#5C6576'}"></span>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;color:#F2F4F7;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
          <div style="font-size:11.5px;color:#5C6576;margin-top:2px">${esc(t.status)}${t.category?' · '+esc(t.category):''} · #${t.number} · ${fmtDate(t.updatedAt)}${t.comments?' · '+t.comments+' resposta'+(t.comments>1?'s':''):''}</div>
        </div>
        <span style="color:#5C6576;font-size:16px;flex-shrink:0">›</span>
      </div>`;
  }

  // ── Lista, separada em Em Aberto / Resolvidos ──
  async function renderList(){
    screen = 'list';
    setChrome({ title:'Tickets', back:false, showNew:true });
    const body = document.getElementById('dm-t-body');
    body.innerHTML = `<div style="text-align:center;color:#8B95A5;font-size:13px;padding:30px 0">A carregar…</div>`;

    const d = await api('listTickets', {});
    if (!d.ok) { body.innerHTML = `<div style="color:#FF6B5E;font-size:13px;text-align:center;padding:20px 0">Erro: ${esc(d.error||'desconhecido')}</div>`; return; }
    cache = d.tickets;

    if (!cache.length) {
      body.innerHTML = `<div style="text-align:center;color:#8B95A5;font-size:13px;padding:40px 20px">Sem tickets ainda.<br>Toca em "+ Novo" para criar o primeiro.</div>`;
      return;
    }

    const abertos    = cache.filter(t => t.status !== 'Resolvido');
    const resolvidos = cache.filter(t => t.status === 'Resolvido');

    body.innerHTML = `
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5;margin-bottom:4px">Em Aberto${abertos.length?' ('+abertos.length+')':''}</div>
      ${abertos.length ? abertos.map(rowHTML).join('') : '<div style="color:#5C6576;font-size:12.5px;padding:10px 0 18px">Nada em aberto.</div>'}
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5;margin:18px 0 4px">Resolvidos${resolvidos.length?' ('+resolvidos.length+')':''}</div>
      ${resolvidos.length ? resolvidos.map(rowHTML).join('') : '<div style="color:#5C6576;font-size:12.5px;padding:10px 0">Ainda nenhum.</div>'}
    `;

    body.querySelectorAll('.dm-t-row').forEach(row => {
      row.onclick = () => renderDetail(parseInt(row.dataset.n, 10));
    });
  }

  // ── Detalhe ──
  async function renderDetail(number){
    screen = 'detail';
    setChrome({ title:'#'+number, back:true, showNew:false });
    const body = document.getElementById('dm-t-body');
    body.innerHTML = `<div style="text-align:center;color:#8B95A5;font-size:13px;padding:30px 0">A carregar…</div>`;

    const d = await api('getTicket', { number });
    if (!d.ok) { body.innerHTML = `<div style="color:#FF6B5E;font-size:13px;text-align:center;padding:20px 0">Erro: ${esc(d.error||'desconhecido')}</div>`; return; }
    const t = d.ticket;

    const commentsHTML = t.comments.map(c => {
      const m = c.body.match(/^\*\*(.+?):\*\*\n\n([\s\S]*)$/);
      const who = m ? m[1] : c.author;
      const text = m ? m[2] : c.body;
      return `
      <div style="background:#12161D;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div style="font-size:11.5px;color:#8B95A5;font-weight:600;margin-bottom:5px">${esc(who)} <span style="color:#5C6576;font-weight:400">· ${fmtDate(c.createdAt)}</span></div>
        <div style="font-size:13.5px;color:#F2F4F7;white-space:pre-wrap;line-height:1.45">${renderRich(text)}</div>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div style="display:flex;gap:6px;margin-bottom:10px">
        ${STATUSES.map(s => `
          <button class="dm-t-status-btn" data-s="${esc(s)}" style="flex:1;padding:9px 4px;border-radius:9px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;
            border:1px solid ${t.status===s ? STATUS_COLOR[s] : 'rgba(255,255,255,0.08)'};
            background:${t.status===s ? STATUS_COLOR[s]+'22' : '#181D26'};
            color:${t.status===s ? STATUS_COLOR[s] : '#8B95A5'}">${esc(s)}</button>
        `).join('')}
      </div>
      <select id="dm-t-category" style="width:100%;padding:9px 11px;margin-bottom:16px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:13px;font-family:inherit">
        <option value="">Sem categoria</option>
        ${CATEGORIES.map(c => `<option value="${esc(c)}" ${t.category===c?'selected':''}>${esc(c)}</option>`).join('')}
      </select>
      <div style="font-size:16px;font-weight:600;color:#F2F4F7;margin-bottom:4px">${esc(t.title)}</div>
      ${(() => {
        const m = t.body.match(/^([\s\S]*?)\n*_Criado por (.+?) a partir da app DM\._\s*$/);
        const cleanBody = m ? m[1].trim() : t.body;
        const creator = m ? m[2] : null;
        return (creator ? `<div style="font-size:11.5px;color:#5C6576;margin-bottom:14px">Criado por ${esc(creator)}</div>` : '') +
               (cleanBody ? `<div style="font-size:13.5px;color:#B8C0CC;white-space:pre-wrap;line-height:1.5;margin-bottom:18px">${renderRich(cleanBody)}</div>` : '');
      })()}
      ${commentsHTML}
      <div style="margin-top:16px">
        <textarea id="dm-t-reply" placeholder="Escrever uma resposta…" rows="3" style="width:100%;padding:11px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box;margin-bottom:8px"></textarea>
        <div id="dm-t-attach-preview" style="display:none;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:#181D26;border:1px solid rgba(255,255,255,0.08);border-radius:9px">
          <span style="font-size:12.5px;color:#8B95A5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="dm-t-attach-name"></span>
          <button id="dm-t-attach-remove" style="background:none;border:none;color:#5C6576;font-size:16px;cursor:pointer;line-height:1">×</button>
        </div>
        <div style="display:flex;gap:8px">
          <input type="file" id="dm-t-file" accept="image/*,.pdf,.doc,.docx,.txt" style="display:none">
          <button id="dm-t-attach-btn" title="Anexar ficheiro" style="width:44px;flex-shrink:0;padding:12px 0;border:1px solid rgba(255,255,255,0.08);border-radius:9px;background:#181D26;color:#8B95A5;font-size:16px;cursor:pointer">📎</button>
          <button id="dm-t-send" style="flex:1;padding:12px;border:none;border-radius:9px;background:#D2A13A;color:#1a1305;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit">Responder</button>
        </div>
        <div id="dm-t-detail-msg" style="margin-top:8px;font-size:12px;text-align:center;min-height:15px"></div>
      </div>`;

    body.querySelectorAll('.dm-t-status-btn').forEach(btn => {
      btn.onclick = async () => {
        if (btn.dataset.s === t.status) return;
        body.querySelectorAll('.dm-t-status-btn').forEach(b => b.disabled = true);
        const res = await api('setStatus', { number, status: btn.dataset.s }, 'POST');
        if (res.ok) renderDetail(number);
        else {
          body.querySelectorAll('.dm-t-status-btn').forEach(b => b.disabled = false);
          document.getElementById('dm-t-detail-msg').textContent = 'Erro: ' + (res.error||'desconhecido');
        }
      };
    });

    document.getElementById('dm-t-category').onchange = async (e) => {
      const val = e.target.value;
      e.target.disabled = true;
      const res = val
        ? await api('setCategory', { number, category: val }, 'POST')
        : { ok: true }; // "Sem categoria" — não há ação de remover; fica como está no GitHub
      e.target.disabled = false;
      if (!res.ok) document.getElementById('dm-t-detail-msg').textContent = 'Erro: ' + (res.error||'desconhecido');
    };

    pendingFile = null;
    const fileInput   = document.getElementById('dm-t-file');
    const attachBtn   = document.getElementById('dm-t-attach-btn');
    const preview     = document.getElementById('dm-t-attach-preview');
    const previewName = document.getElementById('dm-t-attach-name');

    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      if (f.size > 1500000) {
        document.getElementById('dm-t-detail-msg').textContent = 'Ficheiro demasiado grande (máx. ~1,4 MB).';
        fileInput.value = '';
        return;
      }
      pendingFile = f;
      previewName.textContent = '📎 ' + f.name;
      preview.style.display = 'flex';
    };
    document.getElementById('dm-t-attach-remove').onclick = () => {
      pendingFile = null; fileInput.value = ''; preview.style.display = 'none';
    };

    document.getElementById('dm-t-send').onclick = async () => {
      const btn = document.getElementById('dm-t-send');
      const ta  = document.getElementById('dm-t-reply');
      const msg = document.getElementById('dm-t-detail-msg');
      let val = ta.value.trim();

      if (!val && !pendingFile) { msg.style.color = '#FF6B5E'; msg.textContent = 'Escreve algo ou anexa um ficheiro.'; return; }

      btn.disabled = true; attachBtn.disabled = true;

      if (pendingFile) {
        btn.textContent = 'A enviar anexo...';
        const b64 = await readFileAsBase64(pendingFile);
        const up = await apiUpload(number, pendingFile.name, pendingFile.type, b64);
        if (!up.ok) {
          btn.disabled = false; attachBtn.disabled = false; btn.textContent = 'Responder';
          msg.style.color = '#FF6B5E'; msg.textContent = 'Erro no anexo: ' + (up.error||'desconhecido');
          return;
        }
        val = val ? val + '\n\n' + up.markdown : up.markdown;
      }

      btn.textContent = 'A enviar...';
      const res = await api('addComment', { number, body: val }, 'POST');
      btn.disabled = false; attachBtn.disabled = false; btn.textContent = 'Responder';
      if (res.ok) { renderDetail(number); }
      else { msg.style.color = '#FF6B5E'; msg.textContent = 'Erro: ' + (res.error||'desconhecido'); }
    };
  }

  // ── Novo ticket ──
  function renderNew(){
    screen = 'new';
    setChrome({ title:'Novo ticket', back:true, showNew:false });
    const body = document.getElementById('dm-t-body');
    body.innerHTML = `
      <input id="dm-t-new-title" placeholder="Título (ex: Botão de atualizar não funciona)" style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;box-sizing:border-box">
      <select id="dm-t-new-category" style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit">
        <option value="">Sem categoria</option>
        ${CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
      <textarea id="dm-t-new-body" placeholder="Descreve o que aconteceu ou o que gostavas de ver (opcional)" rows="5" style="width:100%;padding:11px;margin-bottom:12px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>
      <button id="dm-t-new-send" style="width:100%;padding:13px;border:none;border-radius:9px;background:#D2A13A;color:#1a1305;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Criar ticket</button>
      <div id="dm-t-new-msg" style="margin-top:10px;font-size:12.5px;text-align:center;min-height:16px"></div>`;

    document.getElementById('dm-t-new-send').onclick = async () => {
      const title    = document.getElementById('dm-t-new-title').value.trim();
      const desc     = document.getElementById('dm-t-new-body').value.trim();
      const category = document.getElementById('dm-t-new-category').value;
      const btn = document.getElementById('dm-t-new-send');
      const msg = document.getElementById('dm-t-new-msg');
      if (!title) { msg.style.color = '#FF6B5E'; msg.textContent = 'Escreve pelo menos um título.'; return; }
      btn.disabled = true; btn.textContent = 'A criar...';
      const res = await api('submitTicket', { title, body: desc, category }, 'POST');
      btn.disabled = false; btn.textContent = 'Criar ticket';
      if (res.ok) { renderDetail(res.number); }
      else { msg.style.color = '#FF6B5E'; msg.textContent = 'Erro: ' + (res.error||'desconhecido'); }
    };
  }

  return { open, close };
})();
