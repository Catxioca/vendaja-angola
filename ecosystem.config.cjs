module.exports = {
  apps: [
    {
      name: "vendaja-backend",
      cwd: "/var/www/vendaja-angola/apps/backend",
      script: "dist/bundle.js",
      instances: "max",
      exec_mode: "cluster",
      max_memory_restart: "1G",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        DATABASE_URL: "postgresql://vendaja_user:VendajaEnterprise2026_SecureDb!@localhost:5432/angola_commerce?schema=public",
        JWT_SECRET: "vendaja-enterprise-prod-jwt-secret-9938217346128741",
        FISCAL_CONFIG_KEY: "vendaja-enterprise-fiscal-key-8837194017264819",
        COMPANY_NIF: "009341302LN046",
        COMPANY_NAME: "VendaJá Angola Enterprise Lda",
        COMPANY_ADDRESS: "Rua Rainha Ginga, Edifício Kinaxixi, Luanda, Angola",
        COMPANY_PROVINCE: "Luanda",
        COMPANY_PHONE: "+244923000000",
        CORS_ORIGIN: "https://vendaja.ao,https://www.vendaja.ao,http://localhost:5173",
        TRUST_PROXY: "true",
        VENDAJA_START_LOCAL_BACKEND: "false",
        ACCOUNTING_ALLOW_CLOSED_PERIOD: "false"
      },
      error_file: "/var/log/pm2/vendaja-backend-error.log",
      out_file: "/var/log/pm2/vendaja-backend-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};
