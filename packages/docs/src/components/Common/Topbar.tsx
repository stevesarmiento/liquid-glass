import styled from "styled-components";

import Logo from "./Logo";
import Searchbar from "./Searchbar";

const TopbarContainer = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 64px;
  padding: 0 28px;
  background: #ffffff;
  border-bottom: 1px solid rgba(17, 17, 17, 0.1);
`;

export default function Topbar({
  onSearchChange,
  searchQuery
}: {
  onSearchChange: (value: string) => void;
  searchQuery: string;
}) {
  return (
    <TopbarContainer>
      <Logo />
      <Searchbar onChange={onSearchChange} value={searchQuery} />
    </TopbarContainer>
  );
}
