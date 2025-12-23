const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Permitir comunicação com o frontend
app.use(cors());
app.use(express.json());

// ====== SIMULAÇÃO DE USUÁRIOS E SALDO ======
let users = {
  "Professor2024#": { // utilizador simulado
    passos: 0,
    doge: 0
  }
};

const DOGE_POR_PASSOS = 10;
const MIN_SAQUE = 50;

// ====== ATUALIZAR PASSOS E SALDO ======
app.post("/passos", (req, res) => {
  try {
    const { novosPassos } = req.body;
    const user = users["Professor2024#"];

    if (typeof novosPassos !== "number" || novosPassos <= 0) {
      return res.json({ success: false });
    }

    // soma apenas os novos passos
    user.passos += novosPassos;

    // converte apenas quando atingir 10 passos
    const dogeGanho = Math.floor(user.passos / DOGE_POR_PASSOS);
    if (dogeGanho > 0) {
      user.doge += dogeGanho;
      user.passos = user.passos % DOGE_POR_PASSOS;
    }

    return res.json({
      success: true,
      passos: passos_atual = 0,
      saldo: user.doge
    });

  } catch (err) {
    console.error("Erro no /passos:", err);
    res.status(500).json({ success: false });
  }
});

// ====== OBTER SALDO REAL ======
app.get("/saldo", (req, res) => {
  try {
    const user = users["Professor2024#"];
    return res.json({ saldo: user.doge, passos: user.passos });
  } catch (err) {
    console.error("Erro no /saldo:", err);
    res.status(500).json({ saldo: 0, passos: 0 });
  }
});

// Rota de teste
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend DOGE Steps está online"
  });
});

app.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});

// ====== LEVANTAMENTO SIMULADO COM SALDO REAL ======
app.post("/withdraw", (req, res) => {
  try {
    const { address, amount } = req.body;
    const user = users["Professor2024#"];

    if (!address || !amount) {
      return res.json({ success: false, message: "Dados incompletos." });
    }

    if (amount > user.doge) {
      return res.json({ success: false, message: "Saldo insuficiente." });
    }

    if (amount < MIN_SAQUE) {
      return res.json({ success: false, message: `Mínimo para levantamento: ${MIN_SAQUE} DOGE.` });
    }

    // desconta saldo
    user.doge -= amount;

    console.log("Levantamento simulado:", { address, amount });
    return res.json({ success: true, message: "Levantamento registado (simulado)." });

  } catch (err) {
    console.error("Erro no /withdraw:", err);
    return res.status(500).json({ success: false, message: "Erro interno." });
  }
});
