interface ProfilePicturesProps {
  users: Array<{ name: string; avatar: string }>;
}

export function ProfilePictures({ users }: ProfilePicturesProps) {
  // Deduplicate by name
  const uniqueUsers = Array.from(
    new Map(users.map((u) => [u.name, u.avatar])).entries(),
  );

  return (
    <div className="flex -space-x-1.5">
      {uniqueUsers.map(([name, avatar]) => (
        <img
          key={name}
          src={avatar}
          alt={name}
          title={name}
          className="h-5 w-5 rounded-full border border-surface"
        />
      ))}
    </div>
  );
}
