/* ══════════════════════════════════════════════════════════════
   DM — enviar feedback/tickets
   O pedido vai para o Code.gs (autenticado com o mesmo PIN da app),
   que por sua vez cria a Issue no GitHub. O token do GitHub nunca
   passa pelo browser.
   ══════════════════════════════════════════════════════════════ */
const Tickets = (() => {

  function formHTML(){
    return `
    <div id="dm-ticket" style="position:fixed;inset:0;background:rgba(10,13,18,0.7);z-index:9998;display:flex;align-items:flex-end;justify-content:center;font-family:'DM Sans',sans-serif">
      <div style="width:100%;max-width:480px;background:#12161D;border:1px solid rgba(255,255,255,0.08);border-radius:20px 20px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom))">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div style="font-size:15px;font-weight:600;color:#F2F4F7">💬 Enviar feedback</div>
          <button id="dm-ticket-close" style="background:none;border:none;color:#8B95A5;font-size:22px;cursor:pointer;line-height:1">×</button>
        </div>
        <input id="dm-ticket-title" placeholder="Título (ex: Botão de atualizar não funciona)" style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;box-sizing:border-box">
        <textarea id="dm-ticket-body" placeholder="Descreve o que aconteceu ou o que gostavas de ver (opcional)" rows="4" style="width:100%;padding:11px;margin-bottom:12px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>
        <button id="dm-ticket-send" style="width:100%;padding:13px;border:none;border-radius:9px;background:#D2A13A;color:#1a1305;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Enviar</button>
        <div id="dm-ticket-msg" style="margin-top:10px;font-size:12.5px;text-align:center;min-height:16px"></div>
      </div>
    </div>`;
  }

  function open(){
    if (document.getElementById('dm-ticket')) return;
    document.body.insertAdjacentHTML('beforeend', formHTML());
    const box   = document.getElementById('dm-ticket');
    const title = document.getElementById('dm-ticket-title');
    const body  = document.getElementById('dm-ticket-body');
    const send  = document.getElementById('dm-ticket-send');
    const msg   = document.getElementById('dm-ticket-msg');

    document.getElementById('dm-ticket-close').onclick = () => box.remove();
    box.addEventListener('click', e => { if (e.target === box) box.remove(); });

    send.onclick = async () => {
      const t = title.value.trim();
      if (!t) { msg.style.color = '#FF6B5E'; msg.textContent = 'Escreve pelo menos um título.'; return; }
      send.disabled = true; send.textContent = 'A enviar...';
      msg.textContent = '';
      try {
        const pin = Auth.getStoredPin() || '';
        const url = Auth.API_URL + '?' + new URLSearchParams({
          action: 'submitTicket', pin, title: t, body: body.value.trim()
        }).toString();
        const r = await fetch(url, { method: 'POST' });
        const d = await r.json();
        if (d.ok) {
          msg.style.color = '#34D399';
          msg.textContent = '✓ Enviado! Obrigado.';
          setTimeout(() => box.remove(), 1200);
        } else {
          msg.style.color = '#FF6B5E';
          msg.textContent = 'Erro: ' + (d.error || 'desconhecido');
          send.disabled = false; send.textContent = 'Enviar';
        }
      } catch (e) {
        msg.style.color = '#FF6B5E';
        msg.textContent = 'Erro de rede: ' + e.message;
        send.disabled = false; send.textContent = 'Enviar';
      }
    };
  }

  return { open };
})();
