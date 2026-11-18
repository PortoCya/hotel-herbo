import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Badge, Modal, PhotoThumb, Spinner } from "../components/Layout";
import { useRealtimeRefresh } from "../realtime";
import { useToast } from "../toast";
import { ACTIVITY_COLOR, brl, CATEGORIES, fmtDate, fmtDateTime } from "../utils";

export default function Consumption() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [reservations, setReservations] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [statement, setStatement] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (novo) | consumo
  const [loading, setLoading] = useState(true);
  const selectedId = Number(params.get("reservation")) || null;

  const loadList = useCallback(async () => {
    const [res, cat] = await Promise.all([api("/reservations/?active=1"), api("/catalog/")]);
    setReservations(res);
    setCatalog(cat.filter((c) => c.is_active));
    setLoading(false);
    if (!selectedId && res.length) setParams({ reservation: res[0].id }, { replace: true });
  }, [selectedId, setParams]);

  const loadStatement = useCallback(async () => {
    if (!selectedId) return setStatement(null);
    setStatement(await api(`/reservations/${selectedId}/statement/`));
  }, [selectedId]);

  useEffect(() => {
    loadList().catch((e) => toast("Erro", e.message, { type: "error" }));
  }, [loadList, toast]);

  useEffect(() => {
    loadStatement().catch((e) => toast("Erro", e.message, { type: "error" }));
  }, [loadStatement, toast]);

  useRealtimeRefresh(["consumption.changed", "reservation.changed", "order.updated"], () => {
    loadList();
    loadStatement();
  });

  const cancelItem = async (item) => {
    const reason = prompt(`Cancelar "${item.quantity}x ${item.description}"?\nMotivo (visível ao hóspede):`, "");
    if (reason === null) return;
    try {
      await api(`/consumptions/${item.id}/cancel/`, { method: "POST", body: { reason } });
      toast("Consumo cancelado", item.description);
      loadStatement();
    } catch (e) {
      toast("Erro ao cancelar", e.message, { type: "error" });
    }
  };

  if (loading) return <Spinner />;
  const res = statement?.reservation;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="ornament">Controle financeiro</div>
          <h1>Consumo & Serviços</h1>
          <p>Lance, edite ou cancele gastos do hóspede. Tudo aparece instantaneamente no app dele.</p>
        </div>
        {res && (
          <button className="btn primary" onClick={() => setEditing({})}>+ Lançar consumo</button>
        )}
      </div>

      <div className="split">
        <div className="res-list">
          <div className="ornament">Hóspedes na casa</div>
          {reservations.length === 0 && <div className="card empty">Nenhum hóspede com check-in ativo.</div>}
          {reservations.map((r) => (
            <button
              key={r.id}
              className={`res-item ${r.id === selectedId ? "active" : ""}`}
              onClick={() => setParams({ reservation: r.id })}
            >
              <strong>{r.guest_name}</strong>
              <span className="muted">{r.room_code} · {r.room_name}</span>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--gold-300)" }}>
                Dia {r.days_hosted} · consumo {brl(r.consumption_total)}
              </div>
            </button>
          ))}
        </div>

        <div>
          {!statement ? (
            <div className="card empty">Selecione um hóspede.</div>
          ) : (
            <div className="grid">
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div className="ornament">{res.code}</div>
                    <h2>{res.guest_name}</h2>
                    <div className="muted">
                      {statement.room.name} · {fmtDate(res.check_in_date)} → {fmtDate(res.check_out_date)} · Dia{" "}
                      {res.days_hosted} de {res.nights}
                    </div>
                  </div>
                  <div className="totals">
                    <div><span>Hospedagem</span><strong>{brl(statement.summary.lodging_total)}</strong></div>
                    <div><span>Consumo</span><strong>{brl(statement.summary.consumption_total)}</strong></div>
                    <div><span>Total</span><strong style={{ color: "var(--gold-300)" }}>{brl(statement.summary.grand_total)}</strong></div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="section-title" style={{ marginTop: 0 }}>
                  <h3>Itens lançados</h3>
                  <span className="muted">
                    {statement.summary.active_items} ativo(s) · {statement.summary.cancelled_items} cancelado(s)
                  </span>
                </div>
                {statement.consumptions.length === 0 ? (
                  <div className="empty">Nenhum consumo lançado ainda.</div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Foto</th><th>Descrição</th><th>Qtd</th><th className="num">Unitário</th>
                        <th className="num">Total</th><th>Lançado</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {statement.consumptions.map((c) => (
                        <tr key={c.id} className={c.status === "cancelado" ? "cancelled" : ""}>
                          <td><PhotoThumb src={c.photo} alt={c.description} /></td>
                          <td>
                            <div className="desc">{c.description}</div>
                            <small>
                              {c.category_display}
                              {c.notes && ` · ${c.notes}`}
                              {c.status === "cancelado" && (
                                <span style={{ color: "var(--danger)" }}> · Cancelado{c.cancel_reason && `: ${c.cancel_reason}`}</span>
                              )}
                            </small>
                          </td>
                          <td>{c.quantity}</td>
                          <td className="num">{brl(c.unit_price)}</td>
                          <td className="num">{brl(c.total)}</td>
                          <td><small>{fmtDateTime(c.created_at)}<br />{c.created_by_name}</small></td>
                          <td className="num" style={{ whiteSpace: "nowrap" }}>
                            {c.status === "ativo" ? (
                              <>
                                <button className="btn sm" onClick={() => setEditing(c)}>Editar</button>{" "}
                                <button className="btn sm danger" onClick={() => cancelItem(c)}>Cancelar</button>
                              </>
                            ) : (
                              <Badge meta={{ color: "var(--danger)", label: "Cancelado" }} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 12 }}>Histórico da estadia</h3>
                <ul className="timeline">
                  {statement.activities.map((a) => (
                    <li key={a.id}>
                      <span className="tdot" style={{ "--c": ACTIVITY_COLOR[a.kind] }} />
                      <span>{a.message}</span>
                      <small>{fmtDateTime(a.created_at)}</small>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && res && (
        <ConsumptionForm
          reservation={res}
          item={editing.id ? editing : null}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadStatement();
          }}
        />
      )}
    </>
  );
}

function ConsumptionForm({ reservation, item, catalog, onClose, onSaved }) {
  const toast = useToast();
  const fileRef = useRef();
  const [form, setForm] = useState({
    catalog_item: item?.catalog_item || "",
    description: item?.description || "",
    category: item?.category || "alimentacao",
    quantity: item?.quantity || 1,
    unit_price: item?.unit_price || "",
    notes: item?.notes || "",
  });
  const [photo, setPhoto] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickCatalog = (e) => {
    const id = e.target.value;
    const c = catalog.find((x) => String(x.id) === id);
    setForm((f) => ({
      ...f,
      catalog_item: id,
      ...(c ? { description: c.name, unit_price: c.price, category: c.category } : {}),
    }));
  };

  const total = (Number(form.quantity) || 0) * (Number(form.unit_price) || 0);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData();
    if (!item) fd.append("reservation", reservation.id);
    if (form.catalog_item) fd.append("catalog_item", form.catalog_item);
    fd.append("description", form.description);
    fd.append("category", form.category);
    fd.append("quantity", form.quantity);
    fd.append("unit_price", form.unit_price);
    fd.append("notes", form.notes);
    if (photo) fd.append("photo", photo);
    if (removePhoto && !photo) fd.append("remove_photo", "true");
    try {
      await api(item ? `/consumptions/${item.id}/` : "/consumptions/", { method: item ? "PATCH" : "POST", body: fd });
      toast(item ? "Consumo atualizado" : "Consumo lançado", `${form.quantity}x ${form.description} · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const grouped = CATEGORIES.map(([key, label]) => [label, catalog.filter((c) => c.category === key)]).filter(
    ([, items]) => items.length
  );

  return (
    <Modal
      title={item ? "Editar consumo" : `Lançar consumo · ${reservation.guest_name}`}
      onClose={onClose}
      width={680}
      footer={
        <>
          <span className="muted" style={{ marginRight: "auto" }}>Total: <strong style={{ color: "var(--gold-200)" }}>{brl(total)}</strong></span>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" form="consumption-form" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </>
      }
    >
      <form id="consumption-form" className="form" onSubmit={submit}>
        {error && <div className="error-box">{error}</div>}
        <label className="field">
          Item do catálogo (opcional — preenche os campos)
          <select value={form.catalog_item} onChange={pickCatalog}>
            <option value="">— Lançamento avulso —</option>
            {grouped.map(([label, items]) => (
              <optgroup key={label} label={label}>
                {items.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {brl(c.price)}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="field">
          Descrição
          <input value={form.description} onChange={set("description")} required maxLength={150} />
        </label>
        <div className="form-row">
          <label className="field">
            Categoria
            <select value={form.category} onChange={set("category")}>
              {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            Quantidade
            <input type="number" min="1" value={form.quantity} onChange={set("quantity")} required />
          </label>
          <label className="field">
            Valor unitário (R$)
            <input type="number" min="0" step="0.01" value={form.unit_price} onChange={set("unit_price")} required />
          </label>
        </div>
        <label className="field">
          Observações
          <input value={form.notes} onChange={set("notes")} maxLength={255} placeholder="Ex.: entregue no deck às 20h" />
        </label>

        <div className="field">
          <span className="muted" style={{ fontSize: 13 }}>Foto do produto / comprovante</span>
          {preview ? (
            <img className="photo-preview" src={preview} alt="Pré-visualização" />
          ) : item?.photo && !removePhoto ? (
            <img className="photo-preview" src={item.photo} alt="Foto atual" />
          ) : null}
          <div className="dropzone" onClick={() => fileRef.current.click()}>
            📷 {photo ? photo.name : "Clique para enviar uma foto (JPG/PNG até 10 MB)"}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files[0] || null)} />
          {item?.photo && !photo && (
            <label className="checkbox">
              <input type="checkbox" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} />
              Remover foto atual
            </label>
          )}
        </div>
      </form>
    </Modal>
  );
}
