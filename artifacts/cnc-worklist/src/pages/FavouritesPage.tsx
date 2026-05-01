import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/useApi";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Material {
  id: number;
  pcode: string;
  displayName: string;
  length: number | null;
  width: number | null;
  thickness: number | null;
  notes: string | null;
  isFavourite: boolean;
}

export default function FavouritesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: favourites = [], isLoading } = useQuery<Material[]>({
    queryKey: ["materials", "favourites"],
    queryFn: () => apiFetch("/materials?favouritesOnly=true"),
  });

  const toggleFavouriteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/materials/${id}/favourite`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: "Removed from favourites" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Favourites</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Frequently used materials — toggle from the Materials screen
        </p>
      </div>

      {isLoading ? (
        <div className="text-zinc-400 text-center py-16">Loading...</div>
      ) : favourites.length === 0 ? (
        <Card className="bg-white border-zinc-200 p-12 text-center">
          <p className="text-zinc-500 text-sm">No favourites yet.</p>
          <p className="text-zinc-400 text-xs mt-1">
            Star a material on the Materials screen to add it here.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50">
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">PCODE</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Description</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">L</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">W</th>
                <th className="text-right px-4 py-2.5 text-zinc-500 font-medium">T</th>
                <th className="text-left px-4 py-2.5 text-zinc-500 font-medium">Notes</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {favourites.map((m, i) => (
                <tr
                  key={m.id}
                  data-testid={`row-favourite-${m.id}`}
                  className={`border-t border-zinc-200 ${i % 2 === 0 ? "bg-white" : "bg-zinc-50"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-blue-600 text-xs font-bold">
                    {m.pcode}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-800">{m.displayName}</td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">
                    {m.length ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">
                    {m.width ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-right font-mono text-xs">
                    {m.thickness ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{m.notes}</td>
                  <td className="px-4 py-2.5">
                    <button
                      data-testid={`button-unfavourite-${m.id}`}
                      onClick={() => toggleFavouriteMutation.mutate(m.id)}
                      title="Remove from favourites"
                      className="text-yellow-500 hover:text-zinc-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
