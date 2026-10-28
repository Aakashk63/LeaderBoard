import { createClient } from './utils/supabase/server';

export default async function Page() {
  const cookieStore = {
    getAll: () => [],
    set: () => {}
  };
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from('todos').select();

  return (
    <ul>
      {todos?.map((todo: any) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  );
}
