/* ══════════════════════════════════════════════════════════════
   DC Family — painel de Garantias
   Lista, adiciona (com upload de fatura para o Drive) e elimina —
   tudo a partir de um modal, tal como os Tickets.
   ══════════════════════════════════════════════════════════════ */
const Garantias = (() => {
  const CATEGORIAS_GAR = ['Eletrodomésticos','Eletrónica','Automóvel','Casa','Saúde','Outros'];
  const TIPOS_GAR = ['Geral','Bateria','Motor','Ecrã','Consumíveis','Adicional'];
  const DURACOES = [1, 2, 3, 4, 5, 8, 10];
  const FIELD_STYLE = "width:100%;padding:10px;margin-top:6px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit";
  const eur = v => '€'+Math.abs(v).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2});

  function shellHTML(){
    return `
    <div id="dm-gar" style="position:fixed;inset:0;background:#0A0D12;z-index:9998;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif">
      <div style="display:flex;align-items:center;gap:10px;padding:calc(28px + env(safe-area-inset-top)) 16px 14px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <div style="flex:1;font-size:16px;font-weight:600;color:#F2F4F7">Garantias</div>
        <button id="dm-g-new" style="background:#212938;border:1px solid rgba(255,255,255,0.08);color:#F4D27A;font-size:13px;font-weight:600;padding:7px 12px;border-radius:9px;cursor:pointer;font-family:inherit">+ Nova</button>
        <button id="dm-g-close" style="background:none;border:none;color:#8B95A5;font-size:24px;cursor:pointer;line-height:1;padding:0 0 0 6px">×</button>
      </div>
      <div id="dm-g-body" style="flex:1;overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch"></div>
    </div>`;
  }

  function open(){
    if (document.getElementById('dm-gar')) return;
    document.body.insertAdjacentHTML('beforeend', shellHTML());
    document.getElementById('dm-g-close').onclick = close;
    document.getElementById('dm-g-new').onclick = openAddGarantia;
    loadGarantias();
  }
  function close(){ const el = document.getElementById('dm-gar'); if (el) el.remove(); document.body.classList.remove('modal-open'); }

  // ── Cores por estado ──────────────────────────────────────────
  function estadoCor(dias, duracaoAnos){
    if (dias < 0) return { cor:'#FF6B5E', label:'Expirada', pct:100 };
    const total = duracaoAnos * 365;
    const pct = Math.round((1 - dias / total) * 100);
    if (dias < 30) return { cor:'#FF6B5E', label:`${dias}d restantes`, pct };
    if (dias < 90) return { cor:'#F0A93A', label:`${dias}d restantes`, pct };
    const meses = Math.floor(dias / 30);
    return { cor:'#34D399', label:`${meses} meses restantes`, pct };
  }

  // ── Lista ────────────────────────────────────────────────────
  async function loadGarantias(){
    const body = document.getElementById('dm-g-body');
    body.innerHTML = [1,2,3].map(()=>'<div style="background:linear-gradient(90deg,#12161D 25%,#181D26 50%,#12161D 75%);background-size:200% 100%;animation:dmGarShimmer 1.4s ease-in-out infinite;border-radius:10px;height:90px;margin-bottom:10px"></div>').join('')
      + `<style>@keyframes dmGarShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>`;
    try {
      const pin = Auth.getStoredPin() || '';
      const url = Auth.API_URL + '?' + new URLSearchParams({ action:'garantiasLista', pin }).toString();
      const r = await fetch(url);
      const d = await r.json();
      if (!d.ok) { body.innerHTML = `<p style="color:#FF6B5E;padding:20px">${d.error}</p>`; return; }
      renderGarantias(d.garantias);
    } catch(e) {
      body.innerHTML = `<p style="color:#FF6B5E;padding:20px">Erro de rede: ${e.message}</p>`;
    }
  }

  function renderGarantias(list){
    const body = document.getElementById('dm-g-body');
    if (!list.length) {
      body.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#8B95A5">
        <div style="font-size:48px;margin-bottom:12px">🛡️</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:6px;color:#F2F4F7">Sem garantias registadas</div>
        <div style="font-size:13px">Toca em "+ Nova" para adicionar a primeira</div>
      </div>`;
      return;
    }
    body.innerHTML = list.map(g => {
      const { cor, label, pct } = estadoCor(g.diasRestantes, g.duracaoAnos);
      return `<div onclick="Garantias._openDetail(${JSON.stringify(g).replace(/"/g,'&quot;')})" style="background:#12161D;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:16px;margin-bottom:10px;cursor:pointer">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <div style="min-width:0">
            <div style="font-size:15px;font-weight:700;margin-bottom:4px;color:#F2F4F7">${g.nome}${g.tipo && g.tipo!=='Geral' ? ` <span style="font-size:11px;font-weight:500;color:#F0A93A;background:rgba(240,169,58,0.15);padding:2px 6px;border-radius:8px">${g.tipo}</span>` : ''}</div>
            <div style="font-size:12px;color:#8B95A5;margin-bottom:10px">${g.categoria}${g.categoria?' · ':''}Comprado em ${g.dataCompra} · ${g.duracaoAnos} ano${g.duracaoAnos>1?'s':''}</div>
          </div>
          <div style="font-size:11px;color:#5C6576;flex-shrink:0;text-align:right">até ${g.dataFim}</div>
        </div>
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:${cor}">${label}</div>
        <div style="height:6px;background:#212938;border-radius:3px;overflow:hidden"><div style="height:6px;border-radius:3px;width:${Math.min(pct,100)}%;background:${cor}"></div></div>
      </div>`;
    }).join('');
  }

  // ── Detalhe / eliminar ───────────────────────────────────────
  function openDetail(g){
    const { cor, label } = estadoCor(g.diasRestantes, g.duracaoAnos);
    document.body.insertAdjacentHTML('beforeend', `
    <div id="dm-g-det" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-end">
      <div style="background:#12161D;border-radius:20px 20px 0 0;width:100%;padding:20px 16px calc(20px + env(safe-area-inset-bottom))">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div style="font-size:16px;font-weight:700;color:#F2F4F7">${g.nome}</div>
          <button onclick="document.getElementById('dm-g-det').remove()" style="background:none;border:none;color:#8B95A5;font-size:22px;cursor:pointer;line-height:1">×</button>
        </div>
        <div style="font-size:13px;color:#8B95A5;margin-bottom:6px">${g.tipo||'Geral'} · ${g.categoria} · ${g.duracaoAnos} ano${g.duracaoAnos>1?'s':''}</div>
        <div style="font-size:13px;margin-bottom:4px;color:#F2F4F7">Comprado em <strong>${g.dataCompra}</strong></div>
        <div style="font-size:13px;margin-bottom:14px;color:#F2F4F7">Garantia até <strong>${g.dataFim}</strong></div>
        <div style="font-size:15px;font-weight:700;color:${cor};margin-bottom:20px">${label}</div>
        ${g.driveUrl ? `<a href="${g.driveUrl}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;background:#212938;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;color:#F2F4F7;text-decoration:none;margin-bottom:14px;font-size:13px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          Ver fatura
        </a>` : '<div style="font-size:13px;color:#5C6576;margin-bottom:14px">Sem fatura anexada</div>'}
        <button onclick="Garantias._confirmDelete(${g.row},'${g.nome.replace(/'/g,"\\'")}','${g.driveId}')" style="width:100%;padding:14px;border:none;border-radius:12px;background:#FF6B5E;color:#fff;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit">
          Eliminar garantia
        </button>
      </div>
    </div>`);
  }

  async function confirmDelete(row, nome, driveId){
    if (!confirm(`Eliminar a garantia de "${nome}"?`)) return;
    const det = document.getElementById('dm-g-det'); if (det) det.remove();
    try {
      const pin = Auth.getStoredPin() || '';
      const r = await fetch(Auth.API_URL + '?action=garantiasDelete&pin=' + encodeURIComponent(pin), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action:'garantiasDelete', pin, row, driveId }),
      });
      const d = await r.json();
      if (!d.ok) { alert('Erro: ' + (d.error||'desconhecido')); return; }
      loadGarantias();
    } catch(e) { alert('Erro de rede: ' + e.message); }
  }

  // ── Adicionar ────────────────────────────────────────────────
  function openAddGarantia(){
    const today = new Date().toISOString().slice(0,10);
    document.body.insertAdjacentHTML('beforeend', `
    <div id="dm-g-add" style="position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:flex-end">
      <div style="background:#12161D;border-radius:20px 20px 0 0;width:100%;max-height:90vh;overflow-y:auto;padding:20px 16px calc(20px + env(safe-area-inset-bottom))">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div style="font-size:16px;font-weight:700;color:#F2F4F7">Nova garantia</div>
          <button onclick="document.getElementById('dm-g-add').remove()" style="background:none;border:none;color:#8B95A5;font-size:22px;cursor:pointer;line-height:1">×</button>
        </div>

        <label style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Produto <span style="color:#FF6B5E">*</span></label>
        <input id="dm-g-nome" type="text" placeholder="ex: Samsung TV 65&quot;" style="${FIELD_STYLE};margin:6px 0 14px">

        <label style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Tipo de garantia</label>
        <select id="dm-g-tipo" style="${FIELD_STYLE};margin:6px 0 14px">
          ${TIPOS_GAR.map(t=>`<option>${t}</option>`).join('')}
        </select>

        <label style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Categoria</label>
        <select id="dm-g-cat" style="${FIELD_STYLE};margin:6px 0 14px">
          ${CATEGORIAS_GAR.map(c=>`<option>${c}</option>`).join('')}
        </select>

        <label style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Data de compra <span style="color:#FF6B5E">*</span></label>
        <input id="dm-g-data" type="date" value="${today}" style="${FIELD_STYLE};margin:6px 0 14px">

        <label style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Duração da garantia <span style="color:#FF6B5E">*</span></label>
        <select id="dm-g-dur" style="${FIELD_STYLE};margin:6px 0 14px">
          ${DURACOES.map(d=>`<option value="${d}"${d===2?' selected':''}>${d} ano${d>1?'s':''}</option>`).join('')}
        </select>

        <label style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Fatura (foto ou PDF, opcional)</label>
        <input id="dm-g-file" type="file" accept="image/*,application/pdf" style="${FIELD_STYLE};margin:6px 0 20px;padding:8px">

        <div id="dm-g-msg" style="font-size:12.5px;color:#FF6B5E;min-height:16px;margin-bottom:10px;text-align:center"></div>
        <button onclick="Garantias._submit()" id="dm-g-submit" style="width:100%;padding:14px;border:none;border-radius:12px;background:#D2A13A;color:#1a1305;font-weight:700;font-size:15px;cursor:pointer;font-family:inherit">
          Adicionar garantia
        </button>
      </div>
    </div>`);
  }

  async function submit(){
    const btn=document.getElementById('dm-g-submit'), msg=document.getElementById('dm-g-msg');
    btn.disabled=true; btn.textContent='A guardar...';
    const restore=()=>{ btn.disabled=false; btn.textContent='Adicionar garantia'; };

    const nome = document.getElementById('dm-g-nome').value.trim();
    const tipo = document.getElementById('dm-g-tipo').value;
    const cat  = document.getElementById('dm-g-cat').value;
    const rawData = document.getElementById('dm-g-data').value;
    const dur  = document.getElementById('dm-g-dur').value;
    const file = document.getElementById('dm-g-file').files[0];

    if (!nome)    { msg.textContent='Indica o nome do produto.'; restore(); return; }
    if (!rawData) { msg.textContent='Indica a data de compra.'; restore(); return; }

    const dataCompra = rawData.split('-').reverse().join('/'); // dd/MM/yyyy

    let filename='', filedata='', mimetype='';
    if (file) {
      if (file.size > 5 * 1024 * 1024) { msg.textContent='Ficheiro demasiado grande (máx. 5 MB).'; restore(); return; }
      filedata = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Erro ao ler ficheiro'));
        r.readAsDataURL(file);
      });
      filename = file.name;
      mimetype = file.type;
    }

    const payload = {
      action: 'garantiasAdd',
      pin: Auth.getStoredPin()||'',
      nome, tipo, categoria: cat, dataCompra, duracaoAnos: dur,
      filename, filedata, mimetype,
    };

    // Retry até 3 vezes para cobrir uma falha silenciosa pontual do Apps Script.
    async function doPost(attempt){
      const r = await fetch(Auth.API_URL + '?action=garantiasAdd&pin=' + encodeURIComponent(payload.pin), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.ok && attempt < 3) {
        await new Promise(res => setTimeout(res, 600 * attempt));
        return doPost(attempt + 1);
      }
      return d;
    }

    try {
      const d = await doPost(1);
      if (!d.ok) { msg.textContent='Erro: '+(d.error||'desconhecido'); restore(); return; }
      const add = document.getElementById('dm-g-add'); if (add) add.remove();
      loadGarantias();
    } catch(e) {
      msg.textContent='Erro de rede: '+e.message;
      restore();
    }
  }

  return { open, close, _openDetail: openDetail, _confirmDelete: confirmDelete, _submit: submit };
})();
