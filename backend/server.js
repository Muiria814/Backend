import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import axios from "axios";
import secp256k1 from "secp256k1";
import { createHash } from "crypto";
import 'dotenv/config';

import { createClient } from "@supabase/supabase-js";

import path from "path";
import { fileURLToPath } from "url";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE = path.join(__dirname, "users.json");
const HOUSE_FILE = path.join(__dirname, "houseWallet.json");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ====== UTIL ======

// Garantir que os arquivos existam
(async () => {
  try {
    await fs.ensureFile(USERS_FILE);
    await fs.ensureFile(HOUSE_FILE);

    // USERS
    try { await fs.readJson(USERS_FILE); }
    catch { await fs.writeJson(USERS_FILE, [], { spaces: 2 }); }

    // HOUSE
    try { await fs.readJson(HOUSE_FILE); }
    catch { await fs.writeJson(HOUSE_FILE, { saldo: 1000 }, { spaces: 2 }); }

  } catch (err) {
    console.error("Erro ao inicializar arquivos:", err);
  }
})();

// Função para ler usuários
async function readUsers() {
  return await fs.readJson(USERS_FILE).catch(() => []);
}

// Função para salvar usuários
async function saveUsers(users) {
  await fs.writeJson(USERS_FILE, users, { spaces: 2 });
}

// Função para ler housewallet
async function readHouse() {
  return await fs.readJson(HOUSE_FILE).catch(() => ({ saldo: 0 }));
}

// Função para salvar housewallet
async function saveHouse(wallet) {
  await fs.writeJson(HOUSE_FILE, wallet, { spaces: 2 });
}
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest();
  }

// ====== REGISTRO (SUPABASE) ======
app.post("/register", async (req, res) => {
  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    return res.json({ success: false, message: "Campos obrigatórios" });
  }

  try {
    // Verificar se já existe email
    const { data: existente, error: erroBusca } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (erroBusca) {
      console.error("Erro Supabase:", erroBusca);
      return res.json({ success: false, message: "Erro ao verificar email" });
    }

    if (existente) {
      return res.json({ success: false, message: "Email já registrado" });
    }

    // Criar novo utilizador
    const newUser = {
      id: Date.now().toString(),
      nome,
      email,
      senha,
      passos: 0,
      doge: 0,
      energia: 100,
      lastConvert: 0
    };

    const { error } = await supabase
      .from("users")
      .insert(newUser);

    if (error) {
      console.error("Erro inserir:", error);
      return res.json({ success: false, message: "Erro ao registrar" });
    }

    return res.json({ success: true, userId: newUser.id });

  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: "Erro inesperado" });
  }
});

// ====== LOGIN (SUPABASE) ======
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .eq("senha", senha)
      .maybeSingle();

    if (error) {
      console.error("Erro Supabase login:", error);
      return res.json({ success: false, message: "Erro no login" });
    }

    if (!user) {
      return res.json({ success: false, message: "Email ou senha incorretos" });
    }

    res.json({
    success: true,
    user: {
      id: user.id,
      nome: user.nome,
      passos: user.passos,
      doge: user.doge,
      energia: user.energia ?? 100
     }
    });

  } catch (err) {
    console.error("Erro inesperado login:", err);
    return res.json({ success: false, message: "Erro inesperado no login" });
  }
});

// ====== PASSOS ======
app.get("/passos/:userId", async (req, res) => {
  const { data, error } = await supabase
    .from("users")
    .select("passos")
    .eq("id", req.params.userId)
    .maybeSingle();

  if (error || !data) return res.json({ passos: 0 });

  res.json({ passos: data.passos || 0 });
});

app.post("/passos/:userId", async (req, res) => {
  const { novosPassos } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("passos")
    .eq("id", req.params.userId)
    .maybeSingle();

  if (!user) return res.json({ success: false });

  const total = (user.passos || 0) + (novosPassos || 0);

  await supabase
    .from("users")
    .update({ passos: total })
    .eq("id", req.params.userId);

  res.json({ success: true, passos: total });
});

// ====== CONVERT ======
app.post("/convert", async (req, res) => {
  const { userId } = req.body;

  // Buscar o user no Supabase
  const { data: users, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .limit(1);

  if (error || !users || users.length === 0) {
    return res.json({ success: false, message: "Usuário não encontrado" });
  }

  const user = users[0];

  const agora = Date.now();

  if (agora - (user.lastConvert || 0) < 5000) {
    return res.json({ success: false, message: "Cooldown ativo" });
  }

  const dogeGanho = Math.floor((user.passos || 0) / 1000);

  if (dogeGanho <= 0) {
    return res.json({ success: false, message: "Sem passos suficientes" });
  }

  const novoSaldo = (user.doge || 0) + dogeGanho;

  // Atualizar no Supabase
  const { error: updateError } = await supabase
    .from("users")
    .update({
      doge: novoSaldo,
      passos: 0,
      lastConvert: agora
    })
    .eq("id", userId);

  if (updateError) {
    return res.json({ success: false, message: "Erro ao atualizar saldo" });
  }

  res.json({ success: true, novoSaldo });
});
// ====== SALDO DOGE ======
app.get("/saldo/:userId", async (req, res) => {
  const userId = req.params.userId;

  const { data: users, error } = await supabase
    .from("users")
    .select("doge")
    .eq("id", userId)
    .limit(1);

  if (error || !users || users.length === 0) {
    return res.json({ success: false, saldo: 0 });
  }

  res.json({
    success: true,
    saldo: users[0].doge || 0
  });
});

// ====== ENERGIA (BUSCAR) ======
app.get("/energia/:userId", async (req, res) => {
  const userId = req.params.userId;

  const { data, error } = await supabase
    .from("users")
    .select("energia")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return res.json({ success: false, energia: 100 });
  }

  res.json({
    success: true,
    energia: data.energia ?? 100
  });
});

// ====== ENERGIA (ATUALIZAR) ======
app.post("/energia", async (req, res) => {
  const { userId, energia } = req.body;

  const { error } = await supabase
    .from("users")
    .update({ energia })
    .eq("id", userId);

  if (error) {
    return res.json({ success: false });
  }

  res.json({ success: true });
});
// ====== WITHDRAW REAL (DOGE MAINNET) ======

const HOUSE_ADDRESS = process.env.HOUSE_ADDRESS;
const HOUSE_PRIVATE = process.env.HOUSE_PRIVATE;
const TOKEN = process.env.BLOCKCYPHER_TOKEN;

app.post("/withdraw", async (req, res) => {
  try {

    console.log("📩 /withdraw foi chamado!", req.body);

    // ===== VALIDAR ENV =====
    if (!HOUSE_ADDRESS || !HOUSE_PRIVATE || !TOKEN) {
      return res.json({ success:false, message:"Variáveis .env em falta" });
    }

    if (HOUSE_PRIVATE.length !== 64) {
      return res.json({ success:false, message:"HOUSE_PRIVATE tem de ser chave HEX (64 chars)" });
    }

    const { userId, address, amount } = req.body;

    if (!userId || !address || !amount)
      return res.json({ success:false, message:"Dados incompletos" });

    if (amount < 0.001)
      return res.json({ success:false, message:"Mínimo 0.001 DOGE" });

    // ===== USER =====
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (!user)
      return res.json({ success:false, message:"Usuário não encontrado" });

    // ===== HOUSE =====
    const { data: house } = await supabase
      .from("users")
      .select("*")
      .eq("role","house")
      .single();

    if (!house)
      return res.json({ success:false, message:"House não encontrada" });

    if ((user.doge||0) < amount)
      return res.json({ success:false, message:"Saldo insuficiente" });

    if ((house.saldo||0) < amount)
      return res.json({ success:false, message:"House sem saldo" });

    // ===== CRIAR TX =====
    const newtx = await axios.post(
      "https://api.blockcypher.com/v1/doge/main/txs/new",
      {
        inputs:[{ addresses:[HOUSE_ADDRESS] }],
        outputs:[{ addresses:[address], value:Math.floor(amount*1e8)}]
      },
      { params:{ token:TOKEN } }
    );

    let tx = newtx.data;
    
    console.log("NEW TX:", newtx.data);

    // ===== CRIAR PUBKEY A PARTIR DA PRIVATE =====
const pk = Buffer.from(HOUSE_PRIVATE,"hex");
const pubkey = Buffer.from(secp256k1.publicKeyCreate(pk)).toString("hex");
    // ===== ASSINAR CORRETAMENTE =====
tx.signatures = [];
tx.pubkeys = [];

const pk = Buffer.from(HOUSE_PRIVATE, "hex");

// pubkey compressa (33 bytes)
const pubkey = Buffer.from(
  secp256k1.publicKeyCreate(pk, true)
).toString("hex");

tx.tosign.forEach(ts => {

  // NÃO re-hash — ts já é hash pronto
  const msg = Buffer.from(ts, "hex");

  // assinatura raw r||s
  const sigObj = secp256k1.ecdsaSign(msg, pk);

  // converter para DER (formato que a BlockCypher aceita)
  const der = secp256k1.signatureExport(sigObj.signature);

  tx.signatures.push(Buffer.from(der).toString("hex"));
  tx.pubkeys.push(pubkey);
});

    // ===== ENVIAR =====
    const sent = await axios.post(
      "https://api.blockcypher.com/v1/doge/main/txs/send",
      tx,
      { params:{ token:TOKEN } }
    );

    const txHash = sent?.data?.tx?.hash;

if (!txHash) {
  console.log("BLOCKCYPHER ERROR:", sent.data);
  return res.json({
    success:false,
    message:"Falha ao enviar transação"
  });
}
    console.log("SEND RESULT:", sent.data);
    
    // ===== ATUALIZAR SALDOS =====
    await supabase.from("users")
      .update({ doge:(user.doge||0)-amount })
      .eq("id", userId);

    await supabase.from("users")
      .update({ saldo:(house.saldo||0)-amount })
      .eq("role","house");

    return res.json({ success:true, txHash });

  } catch(err) {

    console.error("WITHDRAW ERROR:", err?.response?.data || err?.message || err);

    console.log("🔥 DEBUG ERROR:", err?.response?.data, err?.message);

    return res.json({
      success:false,
      message:"Erro ao processar withdraw"
    });
  }
});
app.get("/", (req, res) => {
  res.send("Backend online 🚀");
});

app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});

