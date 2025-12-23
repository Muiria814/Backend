const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Permitir comunicação com o frontend
app.use(cors());
app.use(express.json());

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

// ====== LEVANTAMENTO SIMULADO ======
app.post("/withdraw", (req, res) => {
  try {
    const { address, amount } = req.body;

    if (!address || !amount) {
      return res.json({
        success: false,
        message: "Dados incompletos."
      });
    }

    if (amount < 50) {
      return res.json({
        success: false,
        message: "Saldo insuficiente para levantamento."
      });
    }

    // Simulação apenas (NÃO envia DOGE)
    console.log("Levantamento simulado:", address, amount);

    return res.json({
      success: true,
      message: "Levantamento registado (simulado)."
    });

  } catch (err) {
    console.error("Erro no levantamento:", err);
    return res.status(500).json({
      success: false,
      message: "Erro interno no servidor."
    });
  }
});
