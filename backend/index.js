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
