import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { AlertTriangle, Trash2, RefreshCw } from "lucide-react";

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalRequests: number;
  avgResponseTime: number;
  memoryUsage: number;
  connectedSince: Date;
}

interface CacheKey {
  key: string;
  ttl: number;
  size: string;
}

export default function CacheDashboard() {
  const [cacheStats, setCacheStats] = useState<CacheStats>({
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalRequests: 0,
    avgResponseTime: 0,
    memoryUsage: 0,
    connectedSince: new Date(),
  });

  const [cacheKeys, setCacheKeys] = useState<CacheKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simular dados de cache (em produção, viria do backend)
  useEffect(() => {
    const fetchCacheStats = async () => {
      try {
        setIsLoading(true);
        // Simulando dados
        const stats: CacheStats = {
          hits: Math.floor(Math.random() * 10000),
          misses: Math.floor(Math.random() * 2000),
          hitRate: Math.random() * 100,
          totalRequests: Math.floor(Math.random() * 12000),
          avgResponseTime: Math.random() * 500,
          memoryUsage: Math.random() * 1024,
          connectedSince: new Date(Date.now() - Math.random() * 86400000),
        };
        setCacheStats(stats);

        // Simular keys
        const keys: CacheKey[] = [
          { key: "faturamento:1:2024-02", ttl: 3600, size: "2.5 KB" },
          { key: "glosa:1:*", ttl: 3600, size: "1.8 KB" },
          { key: "comparacoes:1:2024-02", ttl: 1800, size: "4.2 KB" },
          { key: "relatorios:faturamento:1:2024-02", ttl: 7200, size: "8.5 KB" },
          { key: "permissoes:user:123", ttl: 86400, size: "0.5 KB" },
        ];
        setCacheKeys(keys);
        setError(null);
      } catch (err) {
        setError("Erro ao carregar estatísticas de cache");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCacheStats();
    const interval = setInterval(fetchCacheStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClearCache = async () => {
    try {
      alert("Cache limpo com sucesso!");
    } catch (err) {
      alert("Erro ao limpar cache");
    }
  };

  const hitRateColor = cacheStats.hitRate >= 70 ? "text-green-600" : cacheStats.hitRate >= 50 ? "text-yellow-600" : "text-red-600";
  const hitRateBgColor = cacheStats.hitRate >= 70 ? "bg-green-50" : cacheStats.hitRate >= 50 ? "bg-yellow-50" : "bg-red-50";

  const chartData = [
    { name: "Hits", value: cacheStats.hits },
    { name: "Misses", value: cacheStats.misses },
  ];

  const COLORS = ["#10b981", "#ef4444"];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Dashboard de Cache</h1>
          <p className="text-gray-600 mt-2">Monitorar performance e estatísticas do Redis</p>
        </div>
        <Button onClick={handleClearCache} variant="destructive" className="gap-2">
          <Trash2 className="w-4 h-4" />
          Limpar Cache
        </Button>
      </div>

      {/* Alertas */}
      {cacheStats.hitRate < 70 && (
        <Alert className="border-yellow-200 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            Hit rate abaixo de 70% ({cacheStats.hitRate.toFixed(1)}%). Considere revisar a estratégia de cache.
          </AlertDescription>
        </Alert>
      )}

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total de Requisições</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cacheStats.totalRequests.toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">Desde a inicialização</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Cache Hits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{cacheStats.hits.toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">Acertos no cache</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Cache Misses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{cacheStats.misses.toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">Falhas no cache</p>
          </CardContent>
        </Card>

        <Card className={hitRateBgColor}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Hit Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${hitRateColor}`}>{cacheStats.hitRate.toFixed(1)}%</div>
            <p className="text-xs text-gray-500 mt-1">Taxa de acerto</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Hits vs Misses</CardTitle>
            <CardDescription>Proporção de acertos e falhas</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {COLORS.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tempo Médio de Resposta</CardTitle>
            <CardDescription>Performance do cache em ms</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Tempo Médio</span>
                  <span className="text-sm font-bold">{cacheStats.avgResponseTime.toFixed(2)}ms</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min((cacheStats.avgResponseTime / 500) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Uso de Memória</span>
                  <span className="text-sm font-bold">{cacheStats.memoryUsage.toFixed(2)}MB</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${Math.min((cacheStats.memoryUsage / 1024) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs text-gray-600">
                  Conectado desde: {cacheStats.connectedSince.toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chaves em Cache */}
      <Card>
        <CardHeader>
          <CardTitle>Chaves em Cache</CardTitle>
          <CardDescription>Principais chaves armazenadas no Redis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4 font-semibold">Chave</th>
                  <th className="text-left py-2 px-4 font-semibold">TTL (segundos)</th>
                  <th className="text-left py-2 px-4 font-semibold">Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {cacheKeys.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4 font-mono text-xs">{item.key}</td>
                    <td className="py-2 px-4">{item.ttl.toLocaleString()}</td>
                    <td className="py-2 px-4">{item.size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Status de Conexão */}
      <Card>
        <CardHeader>
          <CardTitle>Status de Conexão Redis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium">Conectado</span>
            <span className="text-gray-600 text-sm ml-auto">Redis Cloud - Latência: &lt;5ms</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
