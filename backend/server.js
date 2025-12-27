import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs-extra";
import axios from "axios";
import secp256k1 from "secp256k1";
import { createHash } from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ====== UTIL ======
const USERS_FILE = "./users.json";
const HOUSE_FILE = "./houseWallet.json";

// Garantir que os arquivos existam
await fs.ensureFile(USERS_FILE);
await fs.ensureFile(HOUSE_FILE);
await fs.writeJson(USERS_FILE, await fs.readJson(USERS_FILE).catch(() => []), { spaces: 2 });
await fs.writeJson(HOUSE_FILE, await fs.readJson(HOUSE_FILE).catch(() => ({ saldo: 1000 })), { spaces: 2 });

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

// ====== REGISTRO ======
app.post("/register", async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) return res.json({ success: false, message: "Campos obrigatórios" });

  const users = await readUsers();
  if (users.find(u => u.email === email)) return res.json({ success: false, message: "Email já registrado" });

  const newUser = { id: Date.now().toString(), nome, email, senha, passos: 0, doge: 0, energia: 0, lastConvert: 0 };
  users.push(newUser);
  await saveUsers(users);
  res.json({ success: true, userId: newUser.id });
});

// ====== LOGIN ======
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  const users = await readUsers();
  const user = users.find(u => u.email === email && u.senha === senha);
  if (!user) return res.json({ success: false, message: "Email ou senha incorretos" });
  res.json({ success: true, userId: user.id, nome: user.nome });
});

// ====== PASSOS ======
app.get("/passos/:userId", async (req, res) => {
  const users = await readUsers();
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.json({ passos: 0 });
  res.json({ passos: user.passos || 0 });
});

app.post("/passos/:userId", async (req, res) => {
  const { novosPassos } = req.body;
  const users = await readUsers();
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.json({ success: false, message: "Usuário não encontrado" });

  user.passos = (user.passos || 0) + (novosPassos || 0);
  await saveUsers(users);
  res.json({ success: true, passos: user.passos });
});

// ====== CONVERT ======
app.post("/convert", async (req, res) => {
  const { userId } = req.body;
  const users = await readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ success: false, message: "Usuário não encontrado" });

  const agora = Date.now();
  if (agora - (user.lastConvert || 0) < 5000) return res.json({ success: false, message: "Cooldown ativo" });

  const dogeGanho = Math.floor(user.passos / 1000);
  if (dogeGanho <= 0) return res.json({ success: false, message: "Sem passos suficientes" });

  user.doge += dogeGanho;
  user.passos = 0;
  user.lastConvert = agora;

  await saveUsers(users);
  res.json({ success: true, novoSaldo: user.doge });
});

// ====== WITHDRAW REAL (DOGE MAINNET) ======
app.post("/withdraw", async (req, res) => {
  try {
    const { userId, address, amount } = req.body;

    if (!userId || !address || !amount) {
      return res.json({ success: false, message: "Dados incompletos" });
    }

    const users = await readUsers();
    const house = await readHouse();

    const user = users.find(u => u.id === userId);
    if (!user) {
      return res.json({ success: false, message: "Usuário não encontrado" });
    }

    if (amount < 10) {
      return res.json({ success: false, message: "Mínimo 10 DOGE" });
    }

    if (amount > user.doge) {
      return res.json({ success: false, message: "Saldo insuficiente" });
    }

    if (amount > house.saldo) {
      return res.json({ success: false, message: "House wallet sem saldo" });
    }

    // DOGE usa 1e8 (satoshis)
    const satoshis = Math.floor(amount * 1e8);

    // 1️⃣ Criar transação (unsigned)
    const newTx = await axios.post(
      `https://api.blockcypher.com/v1/doge/main/txs/new?token=${process.env.BLOCKCYPHER_TOKEN}`,
      {
        inputs: [{ addresses: [house.address] }],
        outputs: [{ addresses: [address], value: satoshis }]
      }
    );

    const tx = newTx.data;

    // 2️⃣ Assinar localmente
    tx.pubkeys = [house.public];
    tx.signatures = tx.tosign.map(t =>
      signTx(t, house.private)
    );

    // 3️⃣ Enviar para a rede
    const sendTx = await axios.post(
      `https://api.blockcypher.com/v1/doge/main/txs/send?token=${process.env.BLOCKCYPHER_TOKEN}`,
      tx
    );

    const txHash = sendTx.data.tx.hash;

    // 4️⃣ Atualizar saldos
    user.doge -= amount;
    house.saldo -= amount;

    await saveUsers(users);
    await saveHouse(house);

    res.json({
      success: true,
      txHash,
      amount,
      to: address
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message: "Erro ao enviar DOGE"
    });
  }
});
